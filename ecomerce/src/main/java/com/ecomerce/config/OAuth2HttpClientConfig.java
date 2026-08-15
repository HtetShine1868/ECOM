package com.ecomerce.config;

import org.apache.hc.client5.http.classic.HttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.client5.http.ssl.SSLConnectionSocketFactoryBuilder;
import org.apache.hc.client5.http.ssl.TrustAllStrategy;
import org.apache.hc.core5.ssl.SSLContextBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.security.oauth2.client.endpoint.DefaultAuthorizationCodeTokenResponseClient;
import org.springframework.security.oauth2.client.endpoint.OAuth2AccessTokenResponseClient;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.client.RestTemplate;

import javax.net.ssl.SSLContext;
import java.security.KeyManagementException;
import java.security.KeyStoreException;
import java.security.NoSuchAlgorithmException;

/**
 * Overrides the OAuth2 HTTP client to use Apache HttpClient 5 instead of the
 * default Java HttpsURLConnection. This resolves SSL/TLS handshake failures
 * that occur when a corporate proxy or antivirus performs TLS inspection and
 * presents a certificate the JVM trust store doesn't recognise.
 */
@Configuration
public class OAuth2HttpClientConfig {

    /**
     * Build a RestTemplate backed by Apache HttpClient that trusts all
     * certificates. Scoped to OAuth2 token/user-info calls only.
     */
    private RestTemplate buildTrustAllRestTemplate()
            throws NoSuchAlgorithmException, KeyStoreException, KeyManagementException {

        SSLContext sslContext = SSLContextBuilder.create()
                .loadTrustMaterial(TrustAllStrategy.INSTANCE)
                .build();

        HttpClient httpClient = HttpClients.custom()
                .setConnectionManager(
                        PoolingHttpClientConnectionManagerBuilder.create()
                                .setSSLSocketFactory(
                                        SSLConnectionSocketFactoryBuilder.create()
                                                .setSslContext(sslContext)
                                                .build())
                                .build())
                .build();

        RestTemplate restTemplate = new RestTemplate();
        restTemplate.setRequestFactory(new HttpComponentsClientHttpRequestFactory(httpClient));
        return restTemplate;
    }

    /**
     * Replace the default token-response client so it uses the trust-all
     * RestTemplate when exchanging the authorization code for an access token.
     */
    @Bean
    public OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest>
    accessTokenResponseClient() {
        try {
            DefaultAuthorizationCodeTokenResponseClient client =
                    new DefaultAuthorizationCodeTokenResponseClient();
            client.setRestOperations(buildTrustAllRestTemplate());
            return client;
        } catch (Exception e) {
            throw new RuntimeException("Failed to create OAuth2 token response client", e);
        }
    }

    /**
     * Replace the default user-info service so it uses the trust-all
     * RestTemplate when fetching the user profile after token exchange.
     */
    @Bean
    public OAuth2UserService<OAuth2UserRequest, OAuth2User> oauth2UserService() {
        try {
            DefaultOAuth2UserService service = new DefaultOAuth2UserService();
            service.setRestOperations(buildTrustAllRestTemplate());
            return service;
        } catch (Exception e) {
            throw new RuntimeException("Failed to create OAuth2 user service", e);
        }
    }
}
