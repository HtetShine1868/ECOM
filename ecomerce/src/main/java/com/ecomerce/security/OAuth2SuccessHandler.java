package com.ecomerce.security;

import com.ecomerce.entity.User;
import com.ecomerce.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.Optional;

/**
 * Google / Facebook sign-in.
 *
 * Account rules:
 * <ul>
 *   <li>A social identity is the pair (provider, provider user id). That pair finds the account.</li>
 *   <li>Accounts are <b>never merged on a matching email alone</b>. If the email already belongs to an
 *       account that was created another way (password, or another provider), the login is refused with
 *       {@code error=account_exists}. Otherwise anyone could register a victim's email with a password
 *       first and take over the victim's later Google login.</li>
 *   <li>Google must report {@code email_verified=true}; then the account is verified and active with no
 *       extra email step. Facebook accounts are activated without further verification.</li>
 *   <li>Suspended accounts cannot sign in.</li>
 * </ul>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class OAuth2SuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    private final UserRepository userRepository;
    private final JwtUtil jwtUtil;
    private final OAuthRedirectSupport redirectSupport;
    private final AuthCookieService authCookieService;
    private final OAuthLoginCodeStore loginCodeStore;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request,
                                        HttpServletResponse response,
                                        Authentication authentication) throws IOException {
        String base = redirectSupport.resolveBase(request, response);
        try {
            OAuth2User oAuth2User = (OAuth2User) authentication.getPrincipal();
            String provider = providerOf(authentication);

            String email = attr(oAuth2User, "email");
            String name = attr(oAuth2User, "name");
            String providerId = "facebook".equals(provider) ? attr(oAuth2User, "id") : attr(oAuth2User, "sub");
            if (providerId == null) {
                providerId = attr(oAuth2User, "id");
            }
            if (providerId == null || providerId.isBlank()) {
                throw new IllegalStateException("OAuth provider did not return a user id");
            }

            if ("google".equals(provider) && !Boolean.parseBoolean(String.valueOf(oAuth2User.getAttribute("email_verified")))) {
                log.warn("Google login refused: email is not verified by Google");
                redirectSupport.sendBrowser(response, base + "/login?error=email_not_verified");
                return;
            }
            if (email == null || email.isBlank()) {
                // Facebook can omit the email; the provider id identifies the person.
                email = providerId + "@" + provider + ".oauth.local";
            }
            final String resolvedEmail = email.trim().toLowerCase();
            final String resolvedName = (name == null || name.isBlank()) ? resolvedEmail : name;
            final String pid = providerId;

            Optional<User> byIdentity = userRepository.findByProviderAndProviderId(provider, pid);
            User user;
            if (byIdentity.isPresent()) {
                user = byIdentity.get();
            } else {
                Optional<User> byEmail = userRepository.findByEmail(resolvedEmail);
                if (byEmail.isPresent()) {
                    User existing = byEmail.get();
                    boolean sameProviderLegacy = provider.equals(existing.getProvider()) && existing.getProviderId() == null;
                    if (!sameProviderLegacy) {
                        log.warn("{} login refused: email already belongs to a different sign-in method", provider);
                        redirectSupport.sendBrowser(response, base + "/login?error=account_exists");
                        return;
                    }
                    existing.setProviderId(pid); // older social account created before ids were stored
                    user = existing;
                } else {
                    user = User.builder()
                            .email(resolvedEmail)
                            .name(resolvedName)
                            .provider(provider)
                            .providerId(pid)
                            .role(User.Role.BUYER)
                            .build();
                }
            }

            // null-safe: existing DB rows loaded via JPA bypass @Builder.Default
            User.AccountStatus status = user.getAccountStatus();
            if (status == User.AccountStatus.SUSPENDED) {
                log.warn("{} login refused for {}: account is suspended", provider, user.getEmail());
                redirectSupport.sendBrowser(response, base + "/login?error=suspended");
                return;
            }
            // OAuth providers have already verified the email (Google requires email_verified=true above;
            // Facebook identity is confirmed by the OAuth exchange itself).
            if (!Boolean.TRUE.equals(user.getEmailVerified())) {
                user.setEmailVerified(true);
                user.setEmailVerifiedAt(OffsetDateTime.now());
            }
            // Always (re-)set to ACTIVE on a successful OAuth sign-in; this also
            // upgrades PENDING_EMAIL accounts and fixes null rows from before the column existed.
            user.setAccountStatus(User.AccountStatus.ACTIVE);
            user = userRepository.save(user);

            String token = jwtUtil.generateToken(user.getEmail(), user.getRole().name(), user.getId(), user.getName());
            authCookieService.setTokenCookie(request, response, token);
            String code = loginCodeStore.issue(token);
            redirectSupport.sendBrowser(response, base + "/oauth2/callback?code=" + code);
        } catch (Exception ex) {
            String msg = ex.getClass().getSimpleName() + ": " + (ex.getMessage() != null ? ex.getMessage() : "unknown");
            log.error("OAuth2 success handling failed: [{}] {}", ex.getClass().getSimpleName(), ex.getMessage(), ex);
            String reason = URLEncoder.encode(msg, StandardCharsets.UTF_8);
            redirectSupport.sendBrowser(response, base + "/login?error=oauth&reason=" + reason);
        }
    }

    private String providerOf(Authentication authentication) {
        if (authentication instanceof OAuth2AuthenticationToken token) {
            return token.getAuthorizedClientRegistrationId();
        }
        return "unknown";
    }

    private String attr(OAuth2User user, String key) {
        Object value = user.getAttribute(key);
        return value == null ? null : String.valueOf(value);
    }
}
