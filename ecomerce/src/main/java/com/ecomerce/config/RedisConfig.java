package com.ecomerce.config;

import io.lettuce.core.ClientOptions;
import io.lettuce.core.SocketOptions;
import io.lettuce.core.TimeoutOptions;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.net.URI;
import java.time.Duration;

/**
 * Redis connection.
 *
 * Supports REDIS_URL (redis://user:password@host:port, rediss:// for TLS) or
 * REDIS_HOST / REDIS_PORT / REDIS_PASSWORD / REDIS_SSL.
 *
 * Connection and command timeouts are short on purpose: Redis is optional, and every
 * call goes through {@link com.ecomerce.common.infra.RedisAvailability}, which opens a
 * circuit after a failure so requests fall back to PostgreSQL instead of hanging.
 *
 * All values are stored as plain strings (JSON for cached DTOs). No polymorphic Java type
 * information is stored, so data read back from Redis cannot instantiate arbitrary classes.
 */
@Configuration
@Slf4j
public class RedisConfig {

    @Value("${app.redis.url:}")
    private String redisUrl;

    @Value("${app.redis.host:localhost}")
    private String redisHost;

    @Value("${app.redis.port:6379}")
    private int redisPort;

    @Value("${app.redis.password:}")
    private String redisPassword;

    @Value("${app.redis.ssl:false}")
    private boolean redisSsl;

    @Value("${app.redis.connect-timeout-ms:2000}")
    private long connectTimeoutMs;

    @Value("${app.redis.command-timeout-ms:1000}")
    private long commandTimeoutMs;

    @Bean
    public LettuceConnectionFactory redisConnectionFactory() {
        RedisStandaloneConfiguration config = new RedisStandaloneConfiguration(redisHost, redisPort);
        boolean ssl = redisSsl;
        if (redisUrl != null && !redisUrl.isBlank()) {
            try {
                URI uri = URI.create(redisUrl.trim());
                config = new RedisStandaloneConfiguration(uri.getHost(), uri.getPort() > 0 ? uri.getPort() : 6379);
                String userInfo = uri.getUserInfo();
                if (userInfo != null && !userInfo.isBlank()) {
                    int colon = userInfo.indexOf(':');
                    if (colon >= 0) {
                        String user = userInfo.substring(0, colon);
                        if (!user.isBlank() && !"default".equals(user)) {
                            config.setUsername(user);
                        }
                        config.setPassword(userInfo.substring(colon + 1));
                    } else {
                        config.setPassword(userInfo);
                    }
                }
                ssl = "rediss".equalsIgnoreCase(uri.getScheme());
            } catch (IllegalArgumentException e) {
                // Never log the URL itself: it contains the password.
                log.warn("REDIS_URL could not be parsed; falling back to REDIS_HOST/REDIS_PORT");
            }
        } else if (redisPassword != null && !redisPassword.isBlank()) {
            config.setPassword(redisPassword);
        }

        LettuceClientConfiguration.LettuceClientConfigurationBuilder client = LettuceClientConfiguration.builder()
                .commandTimeout(Duration.ofMillis(commandTimeoutMs))
                .clientOptions(ClientOptions.builder()
                        .socketOptions(SocketOptions.builder()
                                .connectTimeout(Duration.ofMillis(connectTimeoutMs))
                                .build())
                        .timeoutOptions(TimeoutOptions.enabled(Duration.ofMillis(commandTimeoutMs)))
                        // Fail fast while disconnected instead of queueing commands.
                        .disconnectedBehavior(ClientOptions.DisconnectedBehavior.REJECT_COMMANDS)
                        .build());
        if (ssl) {
            client.useSsl();
        }

        LettuceConnectionFactory factory = new LettuceConnectionFactory(config, client.build());
        // Do not connect during startup; the app must start even when Redis is down.
        factory.setEagerInitialization(false);
        return factory;
    }

    @Bean
    public StringRedisTemplate stringRedisTemplate(RedisConnectionFactory connectionFactory) {
        return new StringRedisTemplate(connectionFactory);
    }
}
