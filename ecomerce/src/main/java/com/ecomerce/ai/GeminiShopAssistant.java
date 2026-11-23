package com.ecomerce.ai;

import com.ecomerce.dto.ChatRequest;
import com.ecomerce.dto.ChatResponse;
import com.ecomerce.dto.ProductResponse;
import com.ecomerce.entity.User;
import com.ecomerce.repository.UserRepository;
import com.ecomerce.security.CurrentUser;
import com.ecomerce.service.ImageUrls;
import com.ecomerce.service.ProductService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The shop assistant, powered by Gemini with function calling.
 *
 * Gemini decides which shop functions to call ({@link ShopAssistantTools}), we run them against
 * live data, send the results back, and repeat until Gemini writes the answer. Any phrasing or
 * language works because understanding is done by the model, not by keyword rules.
 *
 * Resilience: models are tried in order (app.ai.gemini.models). A model that answers 429/503/5xx
 * or times out is skipped for a minute and the next one is tried. If none answers, this returns
 * empty and the caller uses the built-in rule-based assistant, so the chat always replies.
 */
@Component
@Slf4j
public class GeminiShopAssistant {

    private static final String BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
    private static final long SKIP_MILLIS = 60_000;

    private final ShopAssistantTools tools;
    private final ProductService productService;
    private final UserRepository userRepository;
    private final ObjectMapper mapper;
    private final RestClient http;
    private final String apiKey;
    private final List<String> models;
    private final int maxRounds;
    private final Map<String, Long> skipUntil = new ConcurrentHashMap<>();

    public GeminiShopAssistant(ShopAssistantTools tools, ProductService productService, UserRepository userRepository,
                               ObjectMapper mapper,
                               @Value("${app.ai.gemini.api-key:}") String apiKey,
                               @Value("${app.ai.gemini.models:gemini-3.8-flash}") String models,
                               @Value("${app.ai.gemini.timeout-seconds:25}") int timeoutSeconds,
                               @Value("${app.ai.gemini.max-tool-rounds:5}") int maxRounds) {
        this.tools = tools;
        this.productService = productService;
        this.userRepository = userRepository;
        this.mapper = mapper;
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.models = Arrays.stream(models.split(",")).map(String::trim).filter(m -> !m.isEmpty()).toList();
        this.maxRounds = Math.max(1, maxRounds);
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(Math.max(5, timeoutSeconds) * 1000);
        this.http = RestClient.builder().requestFactory(factory).build();
        log.info(isEnabled() ? "AI shop assistant: Gemini, models {}" : "AI shop assistant: off (no GEMINI_API_KEY)", this.models);
    }

    public boolean isEnabled() {
        return !apiKey.isEmpty() && !models.isEmpty();
    }

    public Optional<ChatResponse> reply(ChatRequest request) {
        if (!isEnabled() || request.getMessage() == null || request.getMessage().isBlank()) {
            return Optional.empty();
        }
        Optional<User> user = CurrentUser.currentEmail().flatMap(userRepository::findByEmail);
        ArrayNode contents = history(request);
        ShopAssistantTools.ToolTrace trace = new ShopAssistantTools.ToolTrace();

        for (String model : models) {
            if (skipUntil.getOrDefault(model, 0L) > System.currentTimeMillis()) continue;
            try {
                Optional<String> text = converse(model, systemPrompt(user), contents.deepCopy(), trace);
                if (text.isPresent()) {
                    return Optional.of(toResponse(text.get(), trace));
                }
                return Optional.empty(); // blocked or empty answer: let the rule-based assistant reply
            } catch (Unavailable e) {
                skipUntil.put(model, System.currentTimeMillis() + SKIP_MILLIS);
                if (trace.changedBag) {
                    // The bag was already changed; re-running on another model could add it twice.
                    return Optional.of(toResponse("Done, I've updated your bag.", trace));
                }
                log.warn("Gemini model {} unavailable ({}); trying the next one", model, e.getMessage());
            } catch (RuntimeException e) {
                log.warn("Gemini chat failed on {}: {}", model, e.getClass().getSimpleName());
                return Optional.empty();
            }
        }
        return Optional.empty();
    }

    // ─── The function-calling loop ──────────────────────────────────────────

    private Optional<String> converse(String model, String system, ArrayNode contents, ShopAssistantTools.ToolTrace trace) {
        for (int round = 0; round < maxRounds; round++) {
            JsonNode response = call(model, system, contents);
            JsonNode candidate = response.path("candidates").path(0);
            JsonNode content = candidate.path("content");
            if (content.isMissingNode() || !content.has("parts")) {
                log.info("Gemini returned no content (finishReason={})", candidate.path("finishReason").asText("?"));
                return Optional.empty();
            }
            // Keep the model turn exactly as returned: Gemini requires its thought signatures back.
            contents.add(content);

            List<JsonNode> calls = new ArrayList<>();
            StringBuilder text = new StringBuilder();
            for (JsonNode part : content.path("parts")) {
                if (part.has("functionCall")) calls.add(part.get("functionCall"));
                else if (part.has("text") && !part.path("thought").asBoolean(false)) text.append(part.get("text").asText());
            }
            if (calls.isEmpty()) {
                String answer = text.toString().trim();
                return answer.isEmpty() ? Optional.empty() : Optional.of(answer);
            }

            ObjectNode results = mapper.createObjectNode().put("role", "user");
            ArrayNode parts = results.putArray("parts");
            for (JsonNode fc : calls) {
                String name = fc.path("name").asText();
                Map<String, Object> result = tools.call(name, fc.path("args"), trace);
                ObjectNode fr = parts.addObject().putObject("functionResponse");
                fr.put("name", name);
                if (fc.has("id")) fr.put("id", fc.get("id").asText());
                fr.set("response", mapper.valueToTree(Map.of("result", result)));
            }
            contents.add(results);
        }
        log.info("Gemini used all {} tool rounds without a final answer", maxRounds);
        return Optional.empty();
    }

    private JsonNode call(String model, String system, ArrayNode contents) {
        ObjectNode body = mapper.createObjectNode();
        body.putObject("systemInstruction").putArray("parts").addObject().put("text", system);
        body.set("contents", contents);
        body.putArray("tools").addObject().set("functionDeclarations", mapper.valueToTree(ShopAssistantTools.declarations()));
        ObjectNode config = body.putObject("generationConfig");
        config.put("maxOutputTokens", 2048);
        config.putObject("thinkingConfig").put("thinkingLevel", "low"); // quick replies for chat
        try {
            String raw = http.post()
                    .uri(BASE + model + ":generateContent")
                    .header("x-goog-api-key", apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(mapper.writeValueAsString(body))
                    .retrieve()
                    .body(String.class);
            return mapper.readTree(raw == null ? "{}" : raw);
        } catch (HttpStatusCodeException e) {
            int status = e.getStatusCode().value();
            if (status == 429 || status == 404 || status >= 500) {
                throw new Unavailable("HTTP " + status);
            }
            log.warn("Gemini rejected the request: HTTP {} {}", status, abbreviate(e.getResponseBodyAsString()));
            throw new IllegalStateException("Gemini HTTP " + status);
        } catch (ResourceAccessException e) {
            throw new Unavailable("timeout or network error");
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException("Unreadable Gemini response", e);
        }
    }

    // ─── Prompt and history ─────────────────────────────────────────────────

    private String systemPrompt(Optional<User> user) {
        String who = user.map(u -> "The shopper is signed in" + (u.getName() == null ? "" : " as " + firstName(u.getName())) + ".")
                .orElse("The shopper is not signed in, so order and bag tools are unavailable; suggest signing in if they ask.");
        return """
                You are the friendly shop assistant for ShopNow, an online store in Myanmar for kitchen goods, \
                kids' things, food and everyday household items. Prices are in Myanmar kyat (MMK). Today is %s. %s

                How to help:
                - Understand what the shopper actually needs, even if it is vague, misspelled, mixed-language or several \
                questions at once. Infer sensible search keywords (e.g. "something for my 5 year old" -> toys, kids).
                - Use the functions for every fact about products, prices, stock, categories, best sellers, delivery fees, \
                orders and the bag. Never invent products, prices, stock, order details or policies.
                - If a search finds nothing, try different keywords or a broader search before saying it isn't available, \
                and then suggest the closest alternatives.
                - When recommending, name the products exactly as the functions return them, with price, and say if stock \
                is low (5 or fewer) or sold out. Recommend 2-4 good options, not a long dump.
                - For "add it to my bag" requests, use add_to_bag, then confirm what was added. Only add when asked.
                - Reply in the shopper's language (English or Burmese). Keep it short and warm: a sentence or two, then a \
                compact list if useful. Use plain text with "-" bullets; no markdown headings, tables or bold.
                - If you can't help with something (refunds, complaints, anything not in the shop), say so kindly and point \
                them to their Orders page or the shop's contact.
                - End EVERY reply with one final line: FOLLOW_UPS: q1 | q2 | q3 — three short questions the shopper might \
                tap next, written in their voice and relevant to this conversation.

                Shop facts you can rely on:
                - Accounts: sign in from the top right (email/password, Google or Facebook). An account is needed to order.
                - Ordering: add items to the bag, open the bag, press Checkout, enter name, Myanmar phone number (+95...), \
                township and street address, then Place order. The shop shows the order receipt right away.
                - Payment: there is no card payment on the site; payment is settled with the shop on delivery.
                - Total = item prices + any per-item cargo fee + the township delivery fee (one per order).
                - The bag does not reserve stock. Prices and stock are checked again when the order is placed; if a price \
                changed, the shopper is asked to confirm the new price first.
                - Order statuses: PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERING, DELIVERED, CANCELLED. Orders and \
                receipts are under Orders in the menu.
                - Light/dark theme: the sun/moon icon in the top bar.
                """.formatted(LocalDate.now(), who);
    }

    private ArrayNode history(ChatRequest request) {
        ArrayNode contents = mapper.createArrayNode();
        List<ChatRequest.Turn> turns = request.getHistory() == null ? List.of() : request.getHistory();
        boolean started = false;
        for (ChatRequest.Turn turn : turns) {
            if (turn == null || turn.getText() == null || turn.getText().isBlank()) continue;
            boolean isUser = !"assistant".equalsIgnoreCase(turn.getRole());
            if (!started && !isUser) continue; // Gemini conversations start with the user
            started = true;
            ObjectNode c = contents.addObject();
            c.put("role", isUser ? "user" : "model");
            c.putArray("parts").addObject().put("text", turn.getText());
        }
        ObjectNode current = contents.addObject();
        current.put("role", "user");
        current.putArray("parts").addObject().put("text", request.getMessage().trim());
        return contents;
    }

    // ─── Turning the answer into chat UI ────────────────────────────────────

    private ChatResponse toResponse(String answer, ShopAssistantTools.ToolTrace trace) {
        List<String> suggestions = new ArrayList<>();
        StringBuilder body = new StringBuilder();
        for (String line : answer.split("\\R")) {
            String t = line.trim();
            if (t.toUpperCase(Locale.ROOT).startsWith("FOLLOW_UPS:") || t.toUpperCase(Locale.ROOT).startsWith("FOLLOW-UPS:")) {
                for (String s : t.substring(t.indexOf(':') + 1).split("\\|")) {
                    String q = s.trim();
                    if (!q.isEmpty() && q.length() <= 80 && suggestions.size() < 3) suggestions.add(q);
                }
            } else {
                body.append(line).append('\n');
            }
        }
        String reply = body.toString().replace("**", "").trim();

        // Show cards for products the answer actually talks about.
        Map<Long, ProductResponse> pool = new LinkedHashMap<>(trace.products);
        for (Long id : trace.productIdsOnly) {
            if (!pool.containsKey(id)) {
                try {
                    pool.put(id, productService.getProductById(id));
                } catch (RuntimeException ignored) {
                    // product vanished; skip its card
                }
            }
        }
        String lower = reply.toLowerCase(Locale.ROOT);
        List<ChatResponse.ProductCard> cards = pool.values().stream()
                .filter(p -> p.getName() != null && lower.contains(p.getName().toLowerCase(Locale.ROOT)))
                .limit(6)
                .map(GeminiShopAssistant::card)
                .toList();

        List<ChatResponse.Action> actions = new ArrayList<>();
        if (trace.usedOrders && trace.orderIds.size() == 1) {
            actions.add(new ChatResponse.Action("Open order #" + trace.orderIds.get(0), "/receipt/" + trace.orderIds.get(0)));
        }
        if (trace.usedOrders) actions.add(new ChatResponse.Action("My orders", "/orders"));
        if (trace.usedBag) actions.add(new ChatResponse.Action("Open bag", "#bag"));
        if (trace.changedBag) actions.add(new ChatResponse.Action("Checkout", "/checkout"));
        if (!cards.isEmpty() && actions.isEmpty()) actions.add(new ChatResponse.Action("Browse the shop", "/products"));

        return ChatResponse.builder()
                .reply(reply.isEmpty() ? "Here's what I found." : reply)
                .mode("AI")
                .products(new ArrayList<>(cards))
                .suggestions(suggestions)
                .actions(actions)
                .build();
    }

    private static ChatResponse.ProductCard card(ProductResponse p) {
        int stock = p.getStock() == null ? 0 : p.getStock();
        String d = p.getDescription() == null ? null : p.getDescription().strip();
        return ChatResponse.ProductCard.builder()
                .id(p.getId())
                .name(p.getName())
                .description(d == null || d.length() <= 120 ? d : d.substring(0, 117) + "...")
                .price(p.getPrice())
                .stock(stock)
                .available(stock > 0 && Boolean.TRUE.equals(p.getActive()))
                .imageUrl(ImageUrls.reachable(p.getImageUrl()))
                .categoryName(p.getCategoryName())
                .build();
    }

    private static String firstName(String name) {
        String trimmed = name.trim();
        int space = trimmed.indexOf(' ');
        return space > 0 ? trimmed.substring(0, space) : trimmed;
    }

    private static String abbreviate(String s) {
        if (s == null) return "";
        return s.length() > 300 ? s.substring(0, 300) : s;
    }

    /** The model is overloaded, out of quota, or slow: try the next one. */
    private static class Unavailable extends RuntimeException {
        Unavailable(String message) {
            super(message);
        }
    }
}
