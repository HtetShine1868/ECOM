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

@Component
@RequiredArgsConstructor
@Slf4j
public class OAuth2SuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    private final UserRepository userRepository;
    private final JwtUtil jwtUtil;
    private final OAuthRedirectSupport redirectSupport;
    private final AuthCookieService authCookieService;

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
            String providerId = "facebook".equals(provider)
                    ? attr(oAuth2User, "id")
                    : attr(oAuth2User, "sub");
            if (providerId == null) {
                providerId = attr(oAuth2User, "id");
            }
            if ((email == null || email.isBlank()) && providerId != null) {
                email = providerId + "@" + provider + ".oauth.local";
            }
            if (email == null || email.isBlank()) {
                throw new IllegalStateException("OAuth provider did not return an email or id");
            }

            final String resolvedEmail = email.trim();
            final String resolvedName = (name == null || name.isBlank()) ? resolvedEmail : name;
            final String resolvedProviderId = providerId;

            User user = userRepository.findByEmail(resolvedEmail).orElseGet(() -> {
                if (resolvedProviderId != null) {
                    var byProvider = userRepository.findByProviderAndProviderId(provider, resolvedProviderId);
                    if (byProvider.isPresent()) return byProvider.get();
                }
                User created = User.builder()
                        .email(resolvedEmail)
                        .name(resolvedName)
                        .provider(provider)
                        .providerId(resolvedProviderId)
                        .role(User.Role.BUYER)
                        .build();
                return userRepository.save(created);
            });

            if (user.getProvider() == null) {
                user.setProvider(provider);
            }
            if (user.getProviderId() == null && resolvedProviderId != null) {
                user.setProviderId(resolvedProviderId);
            }
            userRepository.save(user);

            String token = jwtUtil.generateToken(
                    user.getEmail(), user.getRole().name(), user.getId(), user.getName());
            authCookieService.setTokenCookie(request, response, token);
            redirectSupport.sendBrowser(response, base + "/oauth2/callback");
        } catch (RuntimeException ex) {
            log.error("OAuth2 success handling failed", ex);
            redirectSupport.sendBrowser(response, base + "/login?error=oauth");
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
