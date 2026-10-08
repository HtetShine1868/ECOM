package com.ecomerce.service;

import com.ecomerce.dto.BestSellerResponse;
import com.ecomerce.dto.ChatRequest;
import com.ecomerce.dto.ChatResponse;
import com.ecomerce.dto.DeliveryZoneResponse;
import com.ecomerce.dto.ProductResponse;
import com.ecomerce.entity.Category;
import com.ecomerce.repository.CategoryRepository;
import com.ecomerce.service.ChatLanguage.Intent;
import com.ecomerce.service.ChatLanguage.Prices;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ChatService {

    private static final int MENTION_MIN = 50;

    private final ProductService productService;
    private final DeliveryZoneService deliveryZoneService;
    private final CategoryRepository categoryRepository;

    public ChatResponse reply(ChatRequest request) {
        boolean productMode = isProductMode(request.getMode());
        List<Category> categories = categoryRepository.findAll();
        List<ProductResponse> catalog = loadCatalog();
        Set<String> vocabulary = vocabulary(catalog, categories);

        String understood = ChatLanguage.correct(ChatLanguage.normalize(request.getMessage()), vocabulary);
        if (understood.isBlank()) {
            return fallback(productMode);
        }
        String text = withContext(understood, request.getHistory(), catalog, vocabulary);

        Map<Intent, Integer> scores = ChatLanguage.score(text);
        Intent intent = ChatLanguage.best(scores);
        int intentScore = intent == null ? 0 : scores.getOrDefault(intent, 0);
        Prices prices = ChatLanguage.prices(text);
        Category category = matchCategory(text, categories);
        String query = ChatLanguage.extractQuery(text);
        if (category != null) {
            query = stripName(query, category.getName());
        }

        if (intent == Intent.CATEGORIES && intentScore >= ChatLanguage.MIN_SCORE && query.isBlank()) {
            return categoriesReply();
        }
        if (intent == Intent.BEST_SELLERS && intentScore >= ChatLanguage.MIN_SCORE && query.isBlank()) {
            Long categoryId = category == null ? null : category.getId();
            return bestSellersReply(categoryId);
        }

        List<ProductResponse> matches = findProducts(text, query, prices, category, intent, catalog);
        int bestMention = matches.stream()
                .mapToInt(product -> ChatLanguage.mentionScore(text, product.getName()))
                .max()
                .orElse(0);

        if (!matches.isEmpty() && !preferSupport(intent, intentScore, query, bestMention)) {
            return productAnswer(matches, query, text, intent, intentScore);
        }

        if (intent != null && ChatLanguage.isHowTo(intent) && intentScore >= ChatLanguage.MIN_SCORE) {
            return ChatResponse.builder()
                    .reply(supportReply(intent))
                    .mode("SUPPORT")
                    .build();
        }

        if (ChatLanguage.isFollowUp(ChatLanguage.normalize(request.getMessage())) && matches.isEmpty()) {
            return ChatResponse.builder()
                    .reply("Which product do you mean? Say the name in your own words and I can check the price and whether it is still in stock.")
                    .mode("PRODUCT")
                    .build();
        }

        if (!query.isBlank() || prices.bounded() || category != null || intent == Intent.CHEAP || intent == Intent.LIST_STOCK) {
            String subject = !query.isBlank()
                    ? query
                    : category != null ? category.getName() : "that";
            return ChatResponse.builder()
                    .reply("I couldn't find anything close to \"" + subject + "\". Try another description, or ask what's in stock.")
                    .mode("PRODUCT")
                    .build();
        }

        return fallback(productMode);
    }

    private boolean preferSupport(Intent intent, int score, String query, int bestMention) {
        if (intent == null || !ChatLanguage.isHowTo(intent) || score < ChatLanguage.MIN_SCORE) {
            return false;
        }
        if (query.isBlank()) {
            return true;
        }
        if (intent == Intent.CHECKOUT || intent == Intent.CART) {
            return false;
        }
        return score >= 6 && bestMention < 70;
    }

    private String withContext(String text, List<ChatRequest.Turn> history, List<ProductResponse> catalog, Set<String> vocabulary) {
        if (!ChatLanguage.isFollowUp(text) || history == null || history.isEmpty()) {
            return text;
        }
        List<String> names = new ArrayList<>();
        int start = Math.max(0, history.size() - 8);
        for (int i = history.size() - 1; i >= start && names.isEmpty(); i--) {
            ChatRequest.Turn turn = history.get(i);
            if (turn == null || turn.getText() == null || turn.getText().isBlank()) {
                continue;
            }
            String past = ChatLanguage.correct(ChatLanguage.normalize(turn.getText()), vocabulary);
            for (ProductResponse product : catalog) {
                if (product.getName() != null && ChatLanguage.mentionScore(past, product.getName()) >= MENTION_MIN) {
                    names.add(product.getName());
                }
            }
        }
        if (names.isEmpty()) {
            return text;
        }
        return text + " " + ChatLanguage.normalize(String.join(" ", names.stream().limit(4).toList()));
    }

    private List<ProductResponse> findProducts(String text, String query, Prices prices, Category category,
                                               Intent intent, List<ProductResponse> catalog) {
        boolean cheap = intent == Intent.CHEAP || text.contains("cheap");
        if (!query.isBlank()) {
            List<ProductResponse> named = rankMentions(catalog, text, prices, category, cheap);
            if (!named.isEmpty()) {
                return named;
            }
            return rankSearch(searchCatalog(query, prices, category), query, cheap);
        }
        if (cheap || intent == Intent.LIST_STOCK || prices.bounded() || category != null) {
            Long categoryId = category == null ? null : category.getId();
            Boolean inStock = intent == Intent.LIST_STOCK ? Boolean.TRUE : null;
            Sort sort = cheap
                    ? Sort.by("price").ascending()
                    : Sort.by(Sort.Order.desc("popularityScore"), Sort.Order.desc("createdAt"));
            return productService.getProducts(null, categoryId, prices.min(), prices.max(), inStock,
                    PageRequest.of(0, 5, sort)).getContent();
        }
        return List.of();
    }

    private List<ProductResponse> rankMentions(List<ProductResponse> catalog, String text, Prices prices,
                                               Category category, boolean cheap) {
        List<ProductResponse> hits = new ArrayList<>();
        for (ProductResponse product : catalog) {
            if (!allowed(product, prices, category)) {
                continue;
            }
            if (ChatLanguage.mentionScore(text, product.getName()) >= MENTION_MIN) {
                hits.add(product);
            }
        }
        if (hits.isEmpty()) {
            return hits;
        }
        int top = hits.stream()
                .mapToInt(product -> ChatLanguage.mentionScore(text, product.getName()))
                .max()
                .orElse(0);
        List<ProductResponse> close = hits.stream()
                .filter(product -> ChatLanguage.mentionScore(text, product.getName()) >= top - 30)
                .toList();
        List<ProductResponse> ranked = new ArrayList<>(close);
        if (cheap) {
            ranked.sort(Comparator.comparing(ProductResponse::getPrice, Comparator.nullsLast(Comparator.naturalOrder())));
        } else {
            ranked.sort(Comparator.comparingInt((ProductResponse product) -> ChatLanguage.mentionScore(text, product.getName())).reversed());
        }
        return ranked.stream().limit(5).toList();
    }

    private List<ProductResponse> searchCatalog(String query, Prices prices, Category category) {
        Long categoryId = category == null ? null : category.getId();
        Sort sort = Sort.by(Sort.Order.desc("popularityScore"), Sort.Order.desc("createdAt"));
        PageRequest pageable = PageRequest.of(0, 8, sort);
        List<ProductResponse> matches = new ArrayList<>(
                productService.getProducts(query, categoryId, prices.min(), prices.max(), null, pageable).getContent());
        if (matches.isEmpty()) {
            for (String token : query.split(" ")) {
                if (token.length() < 3) {
                    continue;
                }
                matches.addAll(productService.getProducts(token, categoryId, prices.min(), prices.max(), null, pageable).getContent());
            }
        }
        return matches;
    }

    private List<ProductResponse> rankSearch(List<ProductResponse> matches, String query, boolean cheap) {
        List<ProductResponse> ranked = new ArrayList<>(dedupe(matches));
        if (cheap) {
            ranked.sort(Comparator.comparing(ProductResponse::getPrice, Comparator.nullsLast(Comparator.naturalOrder())));
        } else if (!query.isBlank()) {
            ranked.sort(Comparator.comparingInt((ProductResponse product) -> relevance(product, query)).reversed());
        }
        return ranked.stream().limit(5).toList();
    }

    private boolean allowed(ProductResponse product, Prices prices, Category category) {
        if (category != null && (product.getCategoryId() == null || !category.getId().equals(product.getCategoryId()))) {
            return false;
        }
        if (product.getPrice() == null) {
            return !prices.bounded();
        }
        if (prices.min() != null && product.getPrice().compareTo(prices.min()) < 0) {
            return false;
        }
        return prices.max() == null || product.getPrice().compareTo(prices.max()) <= 0;
    }

    private ChatResponse productAnswer(List<ProductResponse> matches, String query, String text, Intent intent, int intentScore) {
        String reply = buildProductReply(matches, query, text);
        if (intentScore >= ChatLanguage.MIN_SCORE && intent == Intent.CHECKOUT) {
            reply = reply + " Add it to your cart, then open the cart and place the order.";
        } else if (intentScore >= ChatLanguage.MIN_SCORE && intent == Intent.CART) {
            reply = reply + " Open the product and use Add to Cart.";
        }
        return ChatResponse.builder()
                .reply(reply)
                .mode("PRODUCT")
                .products(matches.stream().limit(5).map(this::toCard).toList())
                .build();
    }

    private String buildProductReply(List<ProductResponse> matches, String query, String text) {
        boolean askingAvailability = text.contains("available") || text.contains("in stock")
                || text.contains("out of stock") || text.contains("sold out") || text.contains("left");
        boolean askingPrice = text.contains("how much") || text.contains("price") || text.contains("cost");

        if (matches.size() == 1) {
            ProductResponse product = matches.getFirst();
            int stock = product.getStock() == null ? 0 : product.getStock();
            boolean available = stock > 0;
            String name = product.getName();
            String price = formatMoney(product.getPrice());
            StringBuilder reply = new StringBuilder();
            if (!available) {
                reply.append(name).append(" is out of stock right now.");
                reply.append(" It is listed at ").append(price).append(".");
            } else if (askingPrice && !askingAvailability) {
                reply.append(name).append(" is ").append(price).append(".");
                reply.append(" There ").append(stock == 1 ? "is " : "are ").append(stock).append(" in stock.");
            } else if (askingAvailability) {
                reply.append("Yes, ").append(name).append(" is available — ")
                        .append(stock).append(stock == 1 ? " unit" : " units")
                        .append(" in stock at ").append(price).append(".");
            } else {
                reply.append(name).append(" is ").append(price)
                        .append(", with ").append(stock).append(stock == 1 ? " unit" : " units")
                        .append(" in stock.");
            }
            if (product.getCategoryName() != null && !product.getCategoryName().isBlank()) {
                reply.append(" Category: ").append(product.getCategoryName()).append(".");
            }
            if (available && product.getCargoPrice() != null && product.getCargoPrice().compareTo(BigDecimal.ZERO) > 0) {
                reply.append(" Cargo fee: ").append(formatMoney(product.getCargoPrice())).append(".");
            }
            return reply.toString();
        }

        long inStock = matches.stream().filter(product -> product.getStock() != null && product.getStock() > 0).count();
        String label = query.isBlank() ? "options" : "matches for \"" + query + "\"";
        if (text.contains("cheap")) {
            return "Here are the lowest-priced " + label + " I can see right now.";
        }
        if (askingAvailability) {
            return "I found " + matches.size() + " " + label + ". "
                    + inStock + (inStock == 1 ? " is" : " are") + " in stock.";
        }
        if (askingPrice) {
            return "Here are prices for " + label + ".";
        }
        return "I found " + matches.size() + " " + label + ". Open a card for the details.";
    }

    private ChatResponse bestSellersReply(Long categoryId) {
        List<BestSellerResponse> sellers = productService.getBestSellers(categoryId, 5, true);
        if (sellers.isEmpty()) {
            return ChatResponse.builder()
                    .reply("There isn't best-seller data for that yet. Browse Products to see what's listed.")
                    .mode("PRODUCT")
                    .build();
        }
        return ChatResponse.builder()
                .reply("These are the ones people are buying the most. Stock shown is live.")
                .mode("PRODUCT")
                .products(sellers.stream().map(this::toCard).toList())
                .build();
    }

    private ChatResponse categoriesReply() {
        List<Category> categories = categoryRepository.findAll();
        if (categories.isEmpty()) {
            return ChatResponse.builder()
                    .reply("No categories are set up yet. You can still browse every product from the Products page.")
                    .mode("PRODUCT")
                    .build();
        }
        String names = categories.stream().map(Category::getName).reduce((a, b) -> a + ", " + b).orElse("");
        return ChatResponse.builder()
                .reply("Right now the shop is grouped into: " + names + ". Ask about one of those and I'll pull matching items.")
                .mode("PRODUCT")
                .build();
    }

    private String supportReply(Intent intent) {
        return switch (intent) {
            case GREETING -> "Hi! Ask me about the shop in your own words — accounts, cart, checkout, delivery, or orders. Or ask if something is still in stock.";
            case REGISTER -> "To create an account, open Sign In in the top right, then Register. Enter your name, email, and password. You can also use Google or Facebook on the login page. After that you can check out and see your orders.";
            case LOGIN -> "Click Sign In in the navbar. Use your email and password, or continue with Google or Facebook. You need to be signed in to place an order and to open Orders.";
            case CHECKOUT -> """
                    Here's how to place an order:
                    1. Sign in.
                    2. Add items to your cart from a product card or product page.
                    3. Open the cart and choose Proceed to Checkout.
                    4. Enter your name and a required Myanmar phone number (+95, digits only).
                    5. Select a delivery township and type your street / block address.
                    6. Place the order.

                    Stock is checked again at checkout. If an item no longer has enough units, the order will not go through.""";
            case CART -> "Use Add to Cart on a product. The bag icon in the navbar, and the floating cart button, open your cart. You can change quantities there, up to the current stock. Checkout starts from the cart.";
            case DELIVERY -> deliveryGuide();
            case ORDERS -> "Open Orders in the navbar while you're signed in. Each order shows items, totals, and status: PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERING, DELIVERED, or CANCELLED. After checkout you also get a receipt page.";
            case BROWSE -> "On Home, use the search box or tap a category. On Products you can search by name, filter by category, price, and in-stock only, and sort by newest, price, name, or popularity. A product page shows details, stock, and related items.";
            case PAYMENT -> "ShopNow records the order on the site — there is no card payment step at checkout. You choose delivery details and place the order. Payment is handled with the store when the order is fulfilled or delivered.";
            case ADMIN -> "Admin accounts see an Admin link in the navbar. From there you can manage products, images, categories, delivery zones, orders, and analytics. Shoppers see the store, cart, and their own orders.";
            case THEME -> "Use the sun / moon icon in the navbar to switch between light and dark. The choice stays in this browser.";
            case HELP -> systemGuide();
            case CATEGORIES, BEST_SELLERS, CHEAP, LIST_STOCK -> null;
        };
    }

    private String systemGuide() {
        return """
                You can ask me in normal sentences. A few things I can help with:
                • Finding products — stock, price, categories, cheap options, best sellers.
                • Account — sign in or register with email, Google, or Facebook.
                • Cart — add items and change quantity up to current stock.
                • Checkout — name, required phone (+95 and digits only), township, and street address. Delivery fee depends on the township; some items also have a cargo fee.
                • Orders — history, status, and the receipt after you place an order.

                Try something like “do you still have headphones?” or “how do I check out?”""";
    }

    private String deliveryGuide() {
        List<DeliveryZoneResponse> zones = deliveryZoneService.getActiveZones();
        StringBuilder reply = new StringBuilder();
        reply.append("We deliver to selected townships. At checkout, pick your township and enter the street or block. ");
        reply.append("Your total is item prices, plus any per-item cargo fee, plus the township delivery fee. ");
        if (zones.isEmpty()) {
            reply.append("No active delivery zones are listed right now — check back or contact the store.");
        } else {
            reply.append("Current townships: ");
            reply.append(zones.stream()
                    .map(zone -> zone.getTownName() + " (" + formatMoney(zone.getFee()) + ")")
                    .reduce((a, b) -> a + ", " + b)
                    .orElse(""));
            reply.append(".");
        }
        return reply.toString();
    }

    private ChatResponse fallback(boolean productMode) {
        if (productMode) {
            return ChatResponse.builder()
                    .reply("Tell me what you're looking for in your own words. I can check stock, prices, categories, and best sellers — for example “got any wireless mice?” or “what's cheap right now?”")
                    .mode("PRODUCT")
                    .build();
        }
        return ChatResponse.builder()
                .reply("I can help with the shop or with products, and you don't need a special phrase. Try “how do I place an order?” or “is the wireless mouse still available?”")
                .mode("SUPPORT")
                .build();
    }

    private List<ProductResponse> loadCatalog() {
        return productService.getProducts(null, null, null, null, null,
                PageRequest.of(0, 200, Sort.by(Sort.Order.desc("popularityScore"), Sort.Order.desc("createdAt"))))
                .getContent();
    }

    private Category matchCategory(String text, List<Category> categories) {
        Category best = null;
        int bestScore = 0;
        for (Category category : categories) {
            if (category.getName() == null) {
                continue;
            }
            int score = ChatLanguage.mentionScore(text, category.getName());
            if (score > bestScore) {
                bestScore = score;
                best = category;
            }
        }
        return bestScore >= 70 ? best : null;
    }

    private Set<String> vocabulary(List<ProductResponse> catalog, List<Category> categories) {
        Set<String> words = new HashSet<>();
        for (ProductResponse product : catalog) {
            addWords(words, product.getName());
        }
        for (Category category : categories) {
            addWords(words, category.getName());
        }
        return words;
    }

    private void addWords(Set<String> words, String raw) {
        if (raw == null) {
            return;
        }
        for (String token : ChatLanguage.normalize(raw).split(" ")) {
            if (token.length() >= 3 && !ChatLanguage.isStopWord(token)) {
                words.add(token);
            }
        }
    }

    private String stripName(String query, String name) {
        Set<String> skip = new HashSet<>();
        for (String token : ChatLanguage.normalize(name).split(" ")) {
            if (!token.isBlank()) {
                skip.add(token);
            }
        }
        StringBuilder out = new StringBuilder();
        for (String token : query.split(" ")) {
            if (token.isBlank() || skip.contains(token)) {
                continue;
            }
            if (out.length() > 0) {
                out.append(' ');
            }
            out.append(token);
        }
        return out.toString();
    }

    private List<ProductResponse> dedupe(List<ProductResponse> matches) {
        Map<Long, ProductResponse> unique = new LinkedHashMap<>();
        for (ProductResponse product : matches) {
            unique.putIfAbsent(product.getId(), product);
        }
        return new ArrayList<>(unique.values());
    }

    private int relevance(ProductResponse product, String query) {
        String name = product.getName() == null ? "" : product.getName().toLowerCase(Locale.ROOT);
        String category = product.getCategoryName() == null ? "" : product.getCategoryName().toLowerCase(Locale.ROOT);
        String q = query.toLowerCase(Locale.ROOT);
        int score = ChatLanguage.mentionScore(q, name);
        if (name.equals(q)) {
            score += 20;
        }
        for (String token : q.split(" ")) {
            if (token.length() > 2 && category.contains(token)) {
                score += 10;
            }
        }
        if (product.getStock() != null && product.getStock() > 0) {
            score += 5;
        }
        return score;
    }

    private ChatResponse.ProductCard toCard(ProductResponse product) {
        int stock = product.getStock() == null ? 0 : product.getStock();
        return ChatResponse.ProductCard.builder()
                .id(product.getId())
                .name(product.getName())
                .description(trimDescription(product.getDescription()))
                .price(product.getPrice())
                .stock(stock)
                .available(stock > 0)
                .imageUrl(product.getImageUrl())
                .categoryName(product.getCategoryName())
                .build();
    }

    private ChatResponse.ProductCard toCard(BestSellerResponse product) {
        int stock = product.getStock() == null ? 0 : product.getStock();
        return ChatResponse.ProductCard.builder()
                .id(product.getProductId())
                .name(product.getName())
                .description(trimDescription(product.getDescription()))
                .price(product.getPrice())
                .stock(stock)
                .available(stock > 0)
                .imageUrl(product.getImageUrl())
                .categoryName(product.getCategoryName())
                .build();
    }

    private String trimDescription(String description) {
        if (description == null) {
            return null;
        }
        String trimmed = description.strip();
        return trimmed.length() <= 120 ? trimmed : trimmed.substring(0, 117) + "...";
    }

    private boolean isProductMode(String mode) {
        return mode != null && mode.trim().equalsIgnoreCase("PRODUCT");
    }

    private String formatMoney(BigDecimal amount) {
        if (amount == null) {
            return "0 MMK";
        }
        return NumberFormat.getNumberInstance(Locale.US).format(amount.longValue()) + " MMK";
    }
}
