package com.ecomerce.service;

/**
 * Product files are stored in Supabase. The project API host
 * ({@code https://<ref>.supabase.co}) refuses connections from some networks,
 * while the same object loads from {@code https://<ref>.storage.supabase.co}.
 */
public final class ImageUrls {

    private ImageUrls() {
    }

    public static String storageRoot(String supabaseUrl) {
        if (supabaseUrl == null || supabaseUrl.isBlank()) {
            return supabaseUrl;
        }
        String root = supabaseUrl.trim().replaceAll("/+$", "");
        if (root.contains(".storage.supabase.co")) {
            return root;
        }
        return root.replace(".supabase.co", ".storage.supabase.co");
    }

    public static String reachable(String imageUrl) {
        if (imageUrl == null || imageUrl.isBlank()) {
            return imageUrl;
        }
        return imageUrl.replaceFirst("^(https://[a-z0-9-]+)\\.supabase\\.co(?=/)", "$1.storage.supabase.co");
    }
}
