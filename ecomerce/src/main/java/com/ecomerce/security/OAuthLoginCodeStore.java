package com.ecomerce.security;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Short-lived, single-use codes that hand the session token from the Google/Facebook
 * callback to the storefront. The storefront and API are on different sites, so browsers
 * that block third-party cookies never send the API's cookie; the code lets the storefront
 * fetch the token directly instead.
 */
@Component
public class OAuthLoginCodeStore {

    private static final long TTL_MS = 2 * 60 * 1000;
    private static final SecureRandom RANDOM = new SecureRandom();

    private record Entry(String token, long expiresAt) {}

    private final Map<String, Entry> codes = new ConcurrentHashMap<>();

    public String issue(String token) {
        purgeExpired();
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        // Hex only: base64url can contain "--", which the SQL-injection guard rejects.
        String code = HexFormat.of().formatHex(bytes);
        codes.put(code, new Entry(token, System.currentTimeMillis() + TTL_MS));
        return code;
    }

    /**
     * Returns the token once; keeps it valid for 15s grace period to allow
     * React StrictMode / component double-mounts to complete the exchange.
     */
    public String consume(String code) {
        if (code == null || code.isBlank()) return null;
        Entry entry = codes.get(code);
        if (entry == null || entry.expiresAt() < System.currentTimeMillis()) {
            codes.remove(code);
            return null;
        }
        // Shorten expiration to 15 seconds from first read to prevent race conditions on double-mount
        long grace = System.currentTimeMillis() + 15_000;
        if (entry.expiresAt() > grace) {
            codes.put(code, new Entry(entry.token(), grace));
        }
        return entry.token();
    }

    private void purgeExpired() {
        long now = System.currentTimeMillis();
        codes.entrySet().removeIf(e -> e.getValue().expiresAt() < now);
    }
}
