package com.ecomerce.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientResponseException;
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
        byte[] bytes = file == null ? new byte[0] : file.getBytes();
        DetectedImage image = detectImage(file, bytes);

        String filename = UUID.randomUUID() + "." + image.extension();
        String uploadUrl = supabaseUrl + "/storage/v1/object/" + bucket + "/" + filename;

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + serviceRoleKey);
        headers.set("apikey", serviceRoleKey);
        headers.setContentType(image.mediaType());

        HttpEntity<byte[]> entity = new HttpEntity<>(bytes, headers);

        ResponseEntity<String> response;
        try {
            response = restTemplate.exchange(
                    uploadUrl, HttpMethod.POST, entity, String.class);
        } catch (RestClientResponseException ex) {
            log.error("Supabase image upload failed: {} {}", ex.getStatusCode(), ex.getResponseBodyAsString());
            throw new IllegalArgumentException("The image could not be stored. Try a different JPEG, PNG, or WebP file.");
        }

        if (!response.getStatusCode().is2xxSuccessful()) {
            throw new IllegalArgumentException("The image could not be stored. Try a different JPEG, PNG, or WebP file.");
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

    private DetectedImage detectImage(MultipartFile file, byte[] bytes) {
        if (file == null || file.isEmpty() || bytes == null || bytes.length == 0) {
            throw new IllegalArgumentException("File is empty or missing");
        }

        long maxSize = 10L * 1024 * 1024;
        if (bytes.length > maxSize) {
            throw new IllegalArgumentException("File size exceeds the 10 MB limit");
        }

        String name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase();
        if (name.endsWith(".svg") || name.endsWith(".svgz")) {
            throw new IllegalArgumentException("SVG uploads are not allowed");
        }

        if (bytes.length >= 3 && bytes[0] == (byte) 0xFF && bytes[1] == (byte) 0xD8 && bytes[2] == (byte) 0xFF) {
            return new DetectedImage("jpg", MediaType.IMAGE_JPEG);
        }
        if (bytes.length >= 8
                && bytes[0] == (byte) 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47
                && bytes[4] == 0x0D && bytes[5] == 0x0A && bytes[6] == 0x1A && bytes[7] == 0x0A) {
            return new DetectedImage("png", MediaType.IMAGE_PNG);
        }
        if (bytes.length >= 12
                && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
                && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P') {
            return new DetectedImage("webp", MediaType.parseMediaType("image/webp"));
        }

        throw new IllegalArgumentException("Only JPEG, PNG, and WebP images are allowed");
    }

    private record DetectedImage(String extension, MediaType mediaType) {
    }
}
