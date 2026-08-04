package com.enterprise.rag.model;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Document(collection = "documents")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DocumentMetadata {
    @Id
    private String id;
    private String filename;
    private String originalName;
    private String filePath;
    private Long fileSize;
    private String mimeType;
    private String status; // pending, processing, completed, failed
    private String uploadedBy; // User ObjectId reference
    private String error;

    @CreatedDate
    private LocalDateTime createdAt;
    
    @LastModifiedDate
    private LocalDateTime updatedAt;
}
