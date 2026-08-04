package com.enterprise.rag.repository;

import com.enterprise.rag.model.DocumentMetadata;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DocumentMetadataRepository extends MongoRepository<DocumentMetadata, String> {
    List<DocumentMetadata> findByUploadedBy(String uploadedBy);
    long countByStatus(String status);
    long countByUploadedBy(String uploadedBy);
    long countByUploadedByAndStatus(String uploadedBy, String status);
}
