package com.ecomerce.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.UUID;

@Service
@Slf4j
public class StorageService {

    @Value("${app.supabase.url}")
    private String supabaseUrl;

    @Value("${app.supabase.service-role-key}")
    private String serviceRoleKey;

    @Value("${app.supabase.bucket}")
    private String bucket;

    private final RestTemplate restTemplate = new RestTemplate();

    // ─── Upload ──────────────────────────────────────────────────────────────

    /**
     * Validates, uploads the image to Supabase Storage, and returns its public URL.
     * The public URL is the only thing stored in PostgreSQL (products.image_url).
     */
    public String uploadProductImage(MultipartFile file) throws IOException {
        validateFile(file);

        String filename = UUID.randomUUID() + "-" + sanitizeFilename(file.getOriginalFilename());
        String uploadUrl = supabaseUrl + "/storage/v1/object/" + bucket + "/" + filename;

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + serviceRoleKey);
        headers.set("apikey", serviceRoleKey);
        headers.setContentType(MediaType.parseMediaType(
                file.getContentType() != null ? file.getContentType() : "image/jpeg"));

        HttpEntity<byte[]> entity = new HttpEntity<>(file.getBytes(), headers);

        ResponseEntity<String> response = restTemplate.exchange(
                uploadUrl, HttpMethod.POST, entity, String.class);

        if (!response.getStatusCode().is2xxSuccessful()) {
            throw new RuntimeException(
                    "Failed to upload image to Supabase Storage. Status: " + response.getStatusCode());
        }

        // Return the public URL — stored in products.image_url
        // Browser loads image directly from Supabase CDN; no auth needed (bucket is public)
        return supabaseUrl + "/storage/v1/object/public/" + bucket + "/" + filename;
    }

    // ─── Delete ──────────────────────────────────────────────────────────────

    /**
     * Deletes an image from Supabase Storage by its public URL.
     * Called when: (1) a product image is replaced, or (2) a product is deleted.
     *
     * Failures are logged but NOT re-thrown — a missing or already-deleted image
     * must not prevent the product from being deleted/updated in PostgreSQL.
     *
     * @param imageUrl the full public URL previously stored in products.image_url
     */
    public void deleteProductImage(String imageUrl) {
        if (imageUrl == null || imageUrl.isBlank()) {
            return;
        }

        // Extract the filename portion from the public URL
        // URL pattern: {supabaseUrl}/storage/v1/object/public/{bucket}/{filename}
        String prefix = supabaseUrl + "/storage/v1/object/public/" + bucket + "/";
        if (!imageUrl.startsWith(prefix)) {
            log.warn("Cannot delete image — URL does not match expected pattern: {}", imageUrl);
            return;
        }

        String filename = imageUrl.substring(prefix.length());
        String deleteUrl = supabaseUrl + "/storage/v1/object/" + bucket + "/" + filename;

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + serviceRoleKey);
        headers.set("apikey", serviceRoleKey);

        HttpEntity<Void> entity = new HttpEntity<>(headers);

        try {
            ResponseEntity<String> response = restTemplate.exchange(
                    deleteUrl, HttpMethod.DELETE, entity, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                log.info("Deleted image from Supabase Storage: {}", filename);
            } else {
                log.warn("Unexpected status {} when deleting image: {}", response.getStatusCode(), filename);
            }
        } catch (Exception e) {
            // Log and swallow — never block product deletion/update due to a storage error
            log.error("Failed to delete image '{}' from Supabase Storage: {}", filename, e.getMessage());
        }
    }

    // ─── Validation ──────────────────────────────────────────────────────────

    private void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("File is empty or missing");
        }

        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new IllegalArgumentException("Only image files are allowed");
        }

        long maxSize = 10L * 1024 * 1024; // 10 MB
        if (file.getSize() > maxSize) {
            throw new IllegalArgumentException("File size exceeds the 10 MB limit");
        }
    }

    /**
     * Strips path separators from the original filename to prevent path traversal.
     */
    private String sanitizeFilename(String original) {
        if (original == null || original.isBlank()) {
            return "image";
        }
        return original.replaceAll("[/\\\\]", "_");
    }
}
