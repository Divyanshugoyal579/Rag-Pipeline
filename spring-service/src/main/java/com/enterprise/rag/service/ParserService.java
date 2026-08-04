package com.enterprise.rag.service;

import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class ParserService {

    public List<Map<String, Object>> parseDocument(String filePath) throws IOException {
        String extension = getFileExtension(filePath);
        log.info("Starting document parsing. File: {}, Format: {}", filePath, extension);

        return switch (extension) {
            case "pdf" -> parsePdf(filePath);
            case "docx" -> parseDocx(filePath);
            case "md" -> parseMarkdown(filePath);
            default -> parseTxt(filePath);
        };
    }

    private List<Map<String, Object>> parsePdf(String filePath) throws IOException {
        List<Map<String, Object>> pagesContent = new ArrayList<>();
        File file = new File(filePath);

        try (PDDocument document = Loader.loadPDF(file)) {
            int totalPages = document.getNumberOfPages();
            PDFTextStripper stripper = new PDFTextStripper();

            for (int pNum = 1; pNum <= totalPages; pNum++) {
                stripper.setStartPage(pNum);
                stripper.setEndPage(pNum);
                String text = stripper.getText(document);

                Map<String, Object> pageData = new HashMap<>();
                pageData.put("page_number", pNum);
                pageData.put("text", text != null ? text.trim() : "");
                pageData.put("heading", "Page " + pNum);
                pageData.put("section", "Section " + pNum);
                pagesContent.add(pageData);
            }
        }
        return pagesContent;
    }

    private List<Map<String, Object>> parseDocx(String filePath) throws IOException {
        List<Map<String, Object>> pagesContent = new ArrayList<>();
        File file = new File(filePath);

        try (FileInputStream fis = new FileInputStream(file);
             XWPFDocument document = new XWPFDocument(fis)) {

            List<String> accumulatedText = new ArrayList<>();
            int charCount = 0;
            int pageNum = 1;
            String currentHeading = "Introduction";

            for (XWPFParagraph para : document.getParagraphs()) {
                String text = para.getText().trim();
                if (text.isEmpty()) continue;

                if (para.getStyleID() != null && para.getStyleID().toLowerCase().contains("heading")) {
                    currentHeading = text;
                }

                accumulatedText.add(text);
                charCount += text.length();

                if (charCount >= 1500) {
                    Map<String, Object> pageData = new HashMap<>();
                    pageData.put("page_number", pageNum);
                    pageData.put("text", String.join("\n", accumulatedText));
                    pageData.put("heading", currentHeading);
                    pageData.put("section", currentHeading);
                    pagesContent.add(pageData);

                    accumulatedText.clear();
                    charCount = 0;
                    pageNum++;
                }
            }

            if (!accumulatedText.isEmpty()) {
                Map<String, Object> pageData = new HashMap<>();
                pageData.put("page_number", pageNum);
                pageData.put("text", String.join("\n", accumulatedText));
                pageData.put("heading", currentHeading);
                pageData.put("section", currentHeading);
                pagesContent.add(pageData);
            }
        }
        return pagesContent;
    }

    private List<Map<String, Object>> parseMarkdown(String filePath) throws IOException {
        List<Map<String, Object>> pagesContent = new ArrayList<>();
        List<String> lines = Files.readAllLines(Paths.get(filePath));

        String currentHeading = "Root";
        List<String> accumulatedText = new ArrayList<>();
        int pageNum = 1;

        for (String line : lines) {
            String striped = line.trim();
            if (striped.startsWith("#")) {
                if (!accumulatedText.isEmpty()) {
                    Map<String, Object> pageData = new HashMap<>();
                    pageData.put("page_number", pageNum);
                    pageData.put("text", String.join("\n", accumulatedText));
                    pageData.put("heading", currentHeading);
                    pageData.put("section", currentHeading);
                    pagesContent.add(pageData);

                    accumulatedText.clear();
                    pageNum++;
                }
                currentHeading = striped.replaceAll("#", "").trim();
            } else {
                accumulatedText.add(line);
            }
        }

        if (!accumulatedText.isEmpty()) {
            Map<String, Object> pageData = new HashMap<>();
            pageData.put("page_number", pageNum);
            pageData.put("text", String.join("\n", accumulatedText));
            pageData.put("heading", currentHeading);
            pageData.put("section", currentHeading);
            pagesContent.add(pageData);
        }

        return pagesContent;
    }

    private List<Map<String, Object>> parseTxt(String filePath) throws IOException {
        List<Map<String, Object>> pagesContent = new ArrayList<>();
        String content = Files.readString(Paths.get(filePath));

        int chunkSize = 2000;
        int pageNum = 1;
        for (int i = 0; i < content.length(); i += chunkSize) {
            int end = Math.min(i + chunkSize, content.length());
            Map<String, Object> pageData = new HashMap<>();
            pageData.put("page_number", pageNum);
            pageData.put("text", content.substring(i, end));
            pageData.put("heading", "Document Body");
            pageData.put("section", "Main Section");
            pagesContent.add(pageData);
            pageNum++;
        }

        return pagesContent;
    }

    private String getFileExtension(String filePath) {
        int lastIndex = filePath.lastIndexOf('.');
        if (lastIndex == -1) return "";
        return filePath.substring(lastIndex + 1).toLowerCase();
    }
}
