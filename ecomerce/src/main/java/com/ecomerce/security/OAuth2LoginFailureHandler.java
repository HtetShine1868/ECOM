package com.ecomerce.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

@Component
@RequiredArgsConstructor
@Slf4j
public class OAuth2LoginFailureHandler extends SimpleUrlAuthenticationFailureHandler {

    private final OAuthRedirectSupport redirectSupport;

    @Override
    public void onAuthenticationFailure(HttpServletRequest request,
                                        HttpServletResponse response,
                                        AuthenticationException exception) throws IOException {
        String msg = (exception != null && exception.getMessage() != null) ? exception.getMessage() : "auth_failed";
        log.warn("OAuth2 login failed: {}", msg);
        String base = redirectSupport.resolveBase(request, response);
        String reason = URLEncoder.encode(msg, StandardCharsets.UTF_8);
        redirectSupport.sendBrowser(response, base + "/login?error=oauth&reason=" + reason);
    }
}
