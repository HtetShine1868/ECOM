package com.ecomerce.mail;

import jakarta.mail.internet.MimeMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;

/**
 * Sends account emails over SMTP. Runs on a background thread so a slow mail server never
 * delays signup. Without MAIL_HOST (local development) the message is not sent and the link
 * is written to the log instead; production must configure SMTP.
 */
@Service
@Slf4j
public class MailService {

    private final org.springframework.beans.factory.ObjectProvider<JavaMailSender> senderProvider;
    private final String from;
    private final boolean smtpConfigured;

    public MailService(org.springframework.beans.factory.ObjectProvider<JavaMailSender> senderProvider,
                       @Value("${app.mail.from}") String from,
                       @Value("${spring.mail.host:}") String host) {
        this.senderProvider = senderProvider;
        this.from = from;
        this.smtpConfigured = host != null && !host.isBlank() && senderProvider.getIfAvailable() != null;
        if (!smtpConfigured) {
            log.warn("MAIL_HOST is not set: verification emails are NOT sent; links are logged instead (development only).");
        }
    }

    public boolean isSmtpConfigured() {
        return smtpConfigured;
    }

    @Async
    public void sendVerificationEmail(String to, String name, String verifyUrl, int validHours) {
        if (!smtpConfigured) {
            log.warn("Verification link for {} (not emailed, SMTP is off): {}", to, verifyUrl);
            return;
        }
        String safeName = HtmlUtils.htmlEscape(name == null || name.isBlank() ? "there" : name.trim());
        String html = """
                <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#222">
                  <h2 style="margin:0 0 12px">Confirm your email</h2>
                  <p>Hi %s, thanks for joining ShopNow. Confirm your email address to start ordering.</p>
                  <p style="margin:24px 0"><a href="%s" style="background:#b8321f;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Verify my email</a></p>
                  <p style="font-size:13px;color:#666">This link works for %d hours and can be used once. If the button does not work, copy this address into your browser:<br>%s</p>
                  <p style="font-size:13px;color:#666">If you did not create an account, you can ignore this email.</p>
                </div>
                """.formatted(safeName, HtmlUtils.htmlEscape(verifyUrl), validHours, HtmlUtils.htmlEscape(verifyUrl));
        try {
            JavaMailSender sender = senderProvider.getObject();
            MimeMessage message = sender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, "UTF-8");
            helper.setFrom(from);
            helper.setTo(to);
            helper.setSubject("Confirm your ShopNow email");
            helper.setText("Hi " + (name == null ? "" : name.trim()) + ", confirm your email: " + verifyUrl, html);
            sender.send(message);
            log.info("Verification email sent to {}", to);
        } catch (Exception e) {
            // The shopper can press "Resend"; never fail signup because mail is down.
            log.error("Could not send verification email to {}: {}", to, e.getClass().getSimpleName());
        }
    }
}
