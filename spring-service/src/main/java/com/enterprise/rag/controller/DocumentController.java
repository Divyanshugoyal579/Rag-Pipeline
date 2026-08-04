package com.enterprise.rag.controller;

import com.enterprise.rag.model.DocumentMetadata;
import com.enterprise.rag.repository.DocumentMetadataRepository;
import com.enterprise.rag.service.ParserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping
@Slf4j
@CrossOrigin(origins = "*")
public class DocumentController {

    private final ParserService parserService;
    private final DocumentMetadataRepository repository;
    private final WebClient webClient;

    private static final String UPLOAD_DIR = "spring_uploads";

    public DocumentController(
            ParserService parserService,
            DocumentMetadataRepository repository,
            WebClient.Builder webClientBuilder,
            @Value("${ai-service.url}") String aiServiceUrl) {
        this.parserService = parserService;
        this.repository = repository;
        this.webClient = webClientBuilder.baseUrl(aiServiceUrl).build();
        
        // Ensure upload directory exists
        File uploadFolder = new File(UPLOAD_DIR);
        if (!uploadFolder.exists()) {
            uploadFolder.mkdirs();
        }
    }

    @PostMapping("/upload")
    public ResponseEntity<Map<String, Object>> uploadDocument(
            @RequestParam("file") MultipartFile file,
            @RequestParam("document_id") String documentId,
            @RequestParam("uploaded_by") String uploadedBy) {

        log.info("Received document upload request. DocumentID: {}, User: {}", documentId, uploadedBy);

        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Empty file uploaded"));
        }

        String originalFilename = file.getOriginalFilename();
        String tempFilename = documentId + "_" + originalFilename;
        Path tempFilePath = Paths.get(UPLOAD_DIR, tempFilename);

        try {
            // Save file locally
            Files.write(tempFilePath, file.getBytes());

            // Save processing entry in MongoDB
            DocumentMetadata metadata = DocumentMetadata.builder()
                    .id(documentId)
                    .filename(tempFilename)
                    .originalName(originalFilename)
                    .filePath(tempFilePath.toString())
                    .fileSize(file.getSize())
                    .mimeType(file.getContentType())
                    .status("processing")
                    .uploadedBy(uploadedBy)
                    .createdAt(LocalDateTime.now())
                    .updatedAt(LocalDateTime.now())
                    .build();

            repository.save(metadata);

            // Execute parsing, chunking, and index forwarding in the background (asynchronous WebClient flow)
            triggerBackgroundIngestion(metadata, tempFilePath.toString());

            Map<String, Object> response = new HashMap<>();
            response.put("message", "Document upload accepted. Parsing started in background.");
            response.put("document", metadata);
            return ResponseEntity.accepted().body(response);

        } catch (IOException e) {
            log.error("Failed to save file", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "File saving failed: " + e.getMessage()));
        }
    }

    @GetMapping
    public ResponseEntity<List<DocumentMetadata>> listDocuments(
            @RequestParam(value = "userId", required = false) String userId,
            @RequestParam(value = "role", required = false) String role) {
        
        List<DocumentMetadata> docs;
        if ("admin".equalsIgnoreCase(role) || userId == null) {
            docs = repository.findAll();
        } else {
            docs = repository.findByUploadedBy(userId);
        }
        return ResponseEntity.ok(docs);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deleteDocument(@PathVariable("id") String id) {
        log.info("Deleting document request. ID: {}", id);

        Optional<DocumentMetadata> optDoc = repository.findById(id);
        if (optDoc.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        DocumentMetadata doc = optDoc.get();

        // 1. Delete physical file
        try {
            Files.deleteIfExists(Paths.get(doc.getFilePath()));
        } catch (IOException e) {
            log.error("Failed to delete local file: {}", doc.getFilePath(), e);
        }

        // 2. Notify FastAPI to remove vector and keyword index chunks
        try {
            webClient.delete()
                    .uri("/documents/{id}", id)
                    .retrieve()
                    .bodyToMono(Void.class)
                    .subscribe(
                            success -> log.info("Successfully deleted index chunks on AI Service for doc: {}", id),
                            error -> log.error("Failed to delete index chunks on AI Service: {}", error.getMessage())
                    );
        } catch (Exception e) {
            log.error("Error communicating with AI Service", e);
        }

        // 3. Delete metadata in MongoDB
        repository.deleteById(id);

        return ResponseEntity.ok(Map.of("message", "Document deleted successfully"));
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getStats(
            @RequestParam(value = "userId", required = false) String userId,
            @RequestParam(value = "role", required = false) String role) {

        long total, completed, failed, processing;

        if ("admin".equalsIgnoreCase(role) || userId == null) {
            total = repository.count();
            completed = repository.countByStatus("completed");
            failed = repository.countByStatus("failed");
            processing = repository.countByStatus("processing");
        } else {
            total = repository.countByUploadedBy(userId);
            completed = repository.countByUploadedByAndStatus(userId, "completed");
            failed = repository.countByUploadedByAndStatus(userId, "failed");
            processing = repository.countByUploadedByAndStatus(userId, "processing");
        }

        Map<String, Object> stats = new HashMap<>();
        stats.put("total", total);
        stats.put("completed", completed);
        stats.put("failed", failed);
        stats.put("processing", processing);

        return ResponseEntity.ok(stats);
    }

    private void triggerBackgroundIngestion(DocumentMetadata doc, String filePath) {
        Mono.fromCallable(() -> {
            // 1. Parse text from pages
            List<Map<String, Object>> pages = parserService.parseDocument(filePath);
            
            // 2. Perform chunking with 1000 character limits and 200 overlap
            return chunkPages(pages, doc);
        })
        .flatMap(chunks -> {
            log.info("Sending {} parsed chunks to FastAPI RAG store for indexing", chunks.size());
            return webClient.post()
                    .uri("/ingest-chunks")
                    .bodyValue(chunks)
                    .retrieve()
                    .toBodilessEntity();
        })
        .subscribe(
                response -> {
                    log.info("RAG Indexing success for document: {}", doc.getId());
                    doc.setStatus("completed");
                    doc.setUpdatedAt(LocalDateTime.now());
                    repository.save(doc);
                },
                error -> {
                    log.error("Failed background parsing or index mapping: {}", error.getMessage());
                    doc.setStatus("failed");
                    doc.setError(error.getMessage());
                    doc.setUpdatedAt(LocalDateTime.now());
                    repository.save(doc);
                }
        );
    }

    private List<Map<String, Object>> chunkPages(List<Map<String, Object>> pages, DocumentMetadata doc) {
        List<Map<String, Object>> chunks = new ArrayList<>();
        int chunkSize = 1000;
        int chunkOverlap = 200;

        for (Map<String, Object> page : pages) {
            String text = (String) page.get("text");
            int pageNum = (int) page.get("page_number");
            String heading = (String) page.get("heading");
            String section = (String) page.get("section");

            if (text == null || text.trim().isEmpty()) continue;

            int start = 0;
            while (start < text.length()) {
                int end = Math.min(start + chunkSize, text.length());
                String chunkText = text.substring(start, end);

                String chunkId = String.format("%s_p%d_c%d", doc.getId(), pageNum, chunks.size());

                Map<String, Object> metadata = new HashMap<>();
                metadata.put("chunk_id", chunkId);
                metadata.put("document_id", doc.getId());
                metadata.put("page_number", pageNum);
                metadata.put("heading", heading);
                metadata.put("section", section);
                metadata.put("source", doc.getOriginalName());
                metadata.put("file_name", doc.getOriginalName());
                metadata.put("author", doc.getUploadedBy());
                metadata.put("tags", List.of("RAG", "Parsed"));
                metadata.put("created_date", LocalDateTime.now().toString());

                Map<String, Object> chunkMap = new HashMap<>();
                chunkMap.put("chunk_id", chunkId);
                chunkMap.put("document_id", doc.getId());
                chunkMap.put("content", chunkText);
                chunkMap.put("metadata", metadata);

                chunks.add(chunkMap);

                start += (chunkSize - chunkOverlap);
            }
        }
        return chunks;
    }
}
