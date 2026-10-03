package com.ecomerce.service;

import com.ecomerce.dto.BestSellerResponse;
import com.ecomerce.dto.ChatRequest;
import com.ecomerce.dto.ChatResponse;
import com.ecomerce.dto.DeliveryZoneResponse;
import com.ecomerce.dto.ProductResponse;
import com.ecomerce.entity.Category;
import com.ecomerce.repository.CategoryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ChatService {

    private static final Set<String> STOP_WORDS = Set.of(
            "a", "an", "the", "is", "are", "am", "was", "were", "be", "been",
            "do", "does", "did", "you", "your", "yours", "me", "my", "i", "we",
            "can", "could", "would", "should", "please", "tell", "about",
            "still", "any", "some", "got", "have", "has", "available",
            "availability", "stock", "instock", "left", "remaining", "now",
            "currently", "how", "much", "many", "what", "whats", "which",
            "where", "when", "why", "price", "cost", "costs", "priced",
            "product", "products", "item", "items", "thing", "show", "find",
            "search", "look", "looking", "for", "get", "buy", "buying",
            "want", "wanted", "need", "needed", "like", "one", "ones",
            "in", "of", "on", "at", "to", "and", "or", "if", "there",
            "this", "that", "these", "those", "hello", "hi", "hey",
            "thanks", "thank", "shopnow", "shop", "store", "under", "below",
            "over", "above", "than", "less", "more", "cheaper", "cheap",
            "cheapest", "max", "min", "between", "mmk", "kyat", "ks",
            "yes", "no", "ok", "okay", "just", "also", "with"
    );

    private static final Pattern PRICE_UNDER = Pattern.compile(
            "(?:under|below|less than|cheaper than|max(?:imum)?|up to)\\s+(\\d{3,})");
    private static final Pattern PRICE_OVER = Pattern.compile(
            "(?:over|above|more than|min(?:imum)?|at least)\\s+(\\d{3,})");

    private final ProductService productService;
    private final DeliveryZoneService deliveryZoneService;
    private final CategoryRepository categoryRepository;

    public ChatResponse reply(ChatRequest request) {
        String normalized = normalize(request.getMessage() == null ? "" : request.getMessage());
        boolean productMode = isProductMode(request.getMode());

        if (normalized.isBlank()) {
            return fallback(productMode);
        }

        if (productMode || looksLikeProductQuery(normalized)) {
            ChatResponse productReply = answerProduct(normalized, productMode);
            if (productReply != null) {
                boolean found = productReply.getProducts() != null && !productReply.getProducts().isEmpty();
                boolean keepProductAnswer = found
                        || isCatalogListIntent(normalized)
                        || (productMode && !looksLikeSupportQuery(normalized));
                if (keepProductAnswer) {
                    return productReply;
                }
            }
        }

        String support = answerSupport(normalized);
        if (support != null) {
            return ChatResponse.builder()
                    .reply(support)
                    .mode("SUPPORT")
                    .build();
        }

        return fallback(productMode);
    }

    private ChatResponse answerProduct(String text, boolean productMode) {
        if (containsAny(text, "category", "categories")) {
            return categoriesReply();
        }
        if (containsAny(text, "best seller", "bestseller", "popular", "top selling", "most sold")) {
            return bestSellersReply();
        }

        BigDecimal maxPrice = firstGroupDecimal(PRICE_UNDER, text);
        BigDecimal minPrice = firstGroupDecimal(PRICE_OVER, text);
        boolean cheap = containsAny(text, "cheap", "cheapest", "lowest price", "budget");
        boolean stockList = containsAny(text, "in stock", "available now", "what do you have",
                "whats in stock", "what's in stock", "show products", "list products",
                "what products", "anything available");

        String query = extractQuery(text);
        Sort sort = cheap
                ? Sort.by("price").ascending()
                : Sort.by(Sort.Order.desc("popularityScore"), Sort.Order.desc("createdAt"));
        PageRequest pageable = PageRequest.of(0, 8, sort);

        List<ProductResponse> matches = new ArrayList<>();
        if (!query.isBlank()) {
            matches.addAll(productService.getProducts(query, null, minPrice, maxPrice, null, pageable).getContent());
            if (matches.isEmpty()) {
                for (String token : query.split("\\s+")) {
                    if (token.length() < 3) {
                        continue;
                    }
                    matches.addAll(productService.getProducts(token, null, minPrice, maxPrice, null, pageable).getContent());
                }
            }
        } else if (stockList || cheap || minPrice != null || maxPrice != null) {
            Boolean inStock = stockList ? Boolean.TRUE : null;
            matches.addAll(productService.getProducts(null, null, minPrice, maxPrice, inStock, pageable).getContent());
        } else if (productMode && containsAny(text, "available", "stock", "price", "cost")) {
            return ChatResponse.builder()
                    .reply("Which product are you asking about? Tell me the name, for example “Is the wireless mouse still available?”")
                    .mode("PRODUCT")
                    .build();
        } else {
            return null;
        }

        matches = dedupeAndRank(matches, query);
        if (matches.isEmpty()) {
            if (query.isBlank()) {
                return ChatResponse.builder()
                        .reply("I could not find products in that range. Try a different price or browse the Products page.")
                        .mode("PRODUCT")
                        .build();
            }
            return ChatResponse.builder()
                    .reply("I could not find a product matching \"" + query + "\". Check the spelling or browse all products.")
                    .mode("PRODUCT")
                    .build();
        }

        return ChatResponse.builder()
                .reply(buildProductReply(matches, query, text))
                .mode("PRODUCT")
                .products(matches.stream().limit(5).map(this::toCard).toList())
                .build();
    }

    private String buildProductReply(List<ProductResponse> matches, String query, String text) {
        boolean askingAvailability = containsAny(text, "available", "in stock", "out of stock",
                "still have", "do you have", "got any", "left", "remaining");
        boolean askingPrice = containsAny(text, "price", "how much", "cost", "expensive");

        if (matches.size() == 1) {
            ProductResponse product = matches.getFirst();
            int stock = product.getStock() == null ? 0 : product.getStock();
            boolean available = stock > 0;
            StringBuilder reply = new StringBuilder();
            if (askingAvailability || query.length() > 0) {
                if (available) {
                    reply.append("Yes — ").append(product.getName()).append(" is still available. ");
                    reply.append("We have ").append(stock).append(stock == 1 ? " unit" : " units").append(" in stock");
                } else {
                    reply.append("No — ").append(product.getName()).append(" is currently out of stock.");
                }
            }
            if (askingPrice || available) {
                if (!reply.isEmpty() && available) {
                    reply.append(" at ").append(formatMoney(product.getPrice())).append(".");
                } else if (reply.isEmpty()) {
                    reply.append(product.getName()).append(" is ").append(formatMoney(product.getPrice())).append(".");
                } else if (!available) {
                    reply.append(" It is listed at ").append(formatMoney(product.getPrice())).append(".");
                }
            }
            if (product.getCategoryName() != null && !product.getCategoryName().isBlank()) {
                reply.append(" Category: ").append(product.getCategoryName()).append(".");
            }
            if (available && product.getCargoPrice() != null && product.getCargoPrice().compareTo(BigDecimal.ZERO) > 0) {
                reply.append(" Cargo fee: ").append(formatMoney(product.getCargoPrice())).append(".");
            }
            return reply.toString();
        }

        long inStock = matches.stream().filter(p -> p.getStock() != null && p.getStock() > 0).count();
        String label = query.isBlank() ? "products" : "matches for \"" + query + "\"";
        if (askingAvailability) {
            return "I found " + matches.size() + " " + label + ". "
                    + inStock + (inStock == 1 ? " is" : " are") + " in stock. Tap a card to open the product.";
        }
        if (askingPrice) {
            return "Here are prices for " + label + ":";
        }
        return "I found " + matches.size() + " " + label + ". Open a card for details or stock.";
    }

    private ChatResponse bestSellersReply() {
        List<BestSellerResponse> sellers = productService.getBestSellers(null, 5, true);
        if (sellers.isEmpty()) {
            return ChatResponse.builder()
                    .reply("We do not have best-seller data yet. Browse the Products page to see what is listed.")
                    .mode("PRODUCT")
                    .build();
        }
        List<ChatResponse.ProductCard> cards = sellers.stream()
                .map(this::toCard)
                .toList();
        return ChatResponse.builder()
                .reply("Here are the current best sellers, ranked by orders. Stock shown is live.")
                .mode("PRODUCT")
                .products(cards)
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
        String names = categories.stream().map(Category::getName).collect(Collectors.joining(", "));
        return ChatResponse.builder()
                .reply("We currently group products into: " + names + ". Ask about a category name to see matching items.")
                .mode("PRODUCT")
                .build();
    }

    private String answerSupport(String text) {
        if (containsAny(text, "hello", "hi", "hey", "good morning", "good afternoon", "good evening")) {
            return "Hi! I am ShopNow support. I can walk you through the store — accounts, shopping, checkout, delivery, and orders. Switch to the Products tab to ask if something is still in stock.";
        }
        if (containsAny(text, "register", "sign up", "signup", "create account", "new account")) {
            return "To create an account: open Sign In in the top right, then go to Register. Enter your name, email, and password. You can also use Google or Facebook on the login page. After you register you can check out and view order history.";
        }
        if (containsAny(text, "login", "log in", "sign in", "signin", "google", "facebook", "oauth")) {
            return "To sign in, click Sign In in the navbar. Use your email and password, or continue with Google or Facebook. You need to be signed in to place an order and to open My Orders.";
        }
        if (containsAny(text, "checkout", "place order", "place an order", "how to order", "how do i order", "how do i buy")) {
            return """
                    How to place an order:
                    1. Sign in.
                    2. Add items to your cart from a product card or product page.
                    3. Open the cart and choose Proceed to Checkout.
                    4. Enter your name and phone number.
                    5. Select a delivery township and type your street / block address.
                    6. Place the order.

                    Stock is checked again at checkout. If an item no longer has enough units, the order will not go through.""";
        }
        if (containsAny(text, "cart", "add to cart", "basket")) {
            return "Click Add to Cart on a product. The bag icon in the navbar (and the floating cart button) opens your cart. You can change quantities there — you cannot add more than the current stock. Checkout is from the cart.";
        }
        if (containsAny(text, "deliver", "shipping", "township", "zone", "cargo", "fee")) {
            return deliveryGuide();
        }
        if (containsAny(text, "order", "track", "history", "status", "receipt")) {
            return "Open Orders in the navbar (you must be signed in). Each order shows items, totals, and status: PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERING, DELIVERED, or CANCELLED. After checkout you also get a receipt page you can keep.";
        }
        if (containsAny(text, "search", "browse", "filter", "sort", "find product")) {
            return "On Home, use the search box or tap a category. On the Products page you can search by name, filter by category, price, and in-stock only, and sort by newest, price, name, or popularity. Opening a product shows details, stock, and related items.";
        }
        if (containsAny(text, "pay", "payment", "cash", "card", "wallet")) {
            return "ShopNow records the order on the site — there is no card payment step at checkout. You choose delivery details and place the order. Payment is handled with the store when the order is fulfilled or delivered.";
        }
        if (containsAny(text, "stock", "available", "availability", "sold out", "out of stock")) {
            return "Each product shows live stock. Out-of-stock items cannot be added to the cart, and low stock (5 or fewer) is highlighted. Switch to the Products tab and ask “Is [product name] still available?” I will check the catalog for you.";
        }
        if (containsAny(text, "admin", "dashboard", "analytics", "manage product")) {
            return "Admin accounts see an Admin link in the navbar. From there you can manage products, images, categories, delivery zones, orders, and analytics. Regular shoppers only see the store, cart, and their own orders.";
        }
        if (containsAny(text, "dark", "theme", "night mode", "light mode")) {
            return "Use the sun / moon icon in the navbar to switch between light and dark theme. The choice is saved in your browser.";
        }
        if (containsAny(text, "help", "guide", "how to use", "how does", "what can you", "what do you", "system")) {
            return systemGuide();
        }
        return null;
    }

    private String systemGuide() {
        return """
                ShopNow quick guide:
                • Browse — Home and Products. Search, filter by category or price, and sort.
                • Account — Sign in or register (email or Google / Facebook) to check out.
                • Cart — Add items, adjust quantity up to current stock, then check out.
                • Checkout — Name, phone, township, and street address. Delivery fee is based on the township; some items also have a cargo fee.
                • Orders — The Orders page lists your history and status. A receipt opens after you place an order.
                • Stock — Product pages show how many units are left. Ask in the Products tab: “Is [name] still available?”

                Ask me about any of those steps, or switch tabs to ask about a specific product.""";
    }

    private String deliveryGuide() {
        List<DeliveryZoneResponse> zones = deliveryZoneService.getActiveZones();
        StringBuilder reply = new StringBuilder();
        reply.append("We deliver to selected townships. At checkout, pick your township and enter the street / block. ");
        reply.append("Your total is item prices + any per-item cargo fee + the township delivery fee. ");
        if (zones.isEmpty()) {
            reply.append("No active delivery zones are listed right now — please check back or contact the store.");
        } else {
            reply.append("Current townships: ");
            reply.append(zones.stream()
                    .map(zone -> zone.getTownName() + " (" + formatMoney(zone.getFee()) + ")")
                    .collect(Collectors.joining(", ")));
            reply.append(".");
        }
        return reply.toString();
    }

    private ChatResponse fallback(boolean productMode) {
        if (productMode) {
            return ChatResponse.builder()
                    .reply("I can check live stock, prices, categories, and best sellers. Try “Is [product] still available?” or “What’s in stock?”")
                    .mode("PRODUCT")
                    .build();
        }
        return ChatResponse.builder()
                .reply("I can explain how ShopNow works — accounts, cart, checkout, delivery, and orders. Ask “How do I place an order?” or open the Products tab to check if something is in stock.")
                .mode("SUPPORT")
                .build();
    }

    private List<ProductResponse> dedupeAndRank(List<ProductResponse> matches, String query) {
        Map<Long, ProductResponse> unique = new LinkedHashMap<>();
        for (ProductResponse product : matches) {
            unique.putIfAbsent(product.getId(), product);
        }
        List<ProductResponse> ranked = new ArrayList<>(unique.values());
        if (!query.isBlank()) {
            String q = query.toLowerCase(Locale.ROOT);
            ranked.sort(Comparator.comparingInt((ProductResponse product) -> score(product, q)).reversed());
        }
        return ranked.stream().limit(5).toList();
    }

    private int score(ProductResponse product, String query) {
        String name = product.getName() == null ? "" : product.getName().toLowerCase(Locale.ROOT);
        String category = product.getCategoryName() == null ? "" : product.getCategoryName().toLowerCase(Locale.ROOT);
        int score = 0;
        if (name.equals(query)) {
            score += 100;
        } else if (name.startsWith(query)) {
            score += 80;
        } else if (name.contains(query)) {
            score += 60;
        }
        for (String token : query.split("\\s+")) {
            if (token.length() > 2 && name.contains(token)) {
                score += 20;
            }
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

    private String extractQuery(String text) {
        String withoutPrices = text
                .replaceAll("(?:under|below|less than|cheaper than|max(?:imum)?|up to|over|above|more than|min(?:imum)?|at least)\\s+\\d{3,}", " ")
                .replaceAll("\\b\\d+\\b", " ");
        StringBuilder query = new StringBuilder();
        for (String token : withoutPrices.split("\\s+")) {
            if (token.isBlank() || STOP_WORDS.contains(token)) {
                continue;
            }
            if (query.length() > 0) {
                query.append(' ');
            }
            query.append(token);
        }
        return query.toString();
    }

    private boolean looksLikeSupportQuery(String text) {
        return containsAny(text, "how", "guide", "checkout", "deliver",
                "register", "login", "account", "cart", "help", "system",
                "sign in", "sign up", "place order", "track");
    }

    private boolean looksLikeProductQuery(String text) {
        return containsAny(text,
                "available", "in stock", "out of stock", "still have", "do you have",
                "got any", "price", "how much", "cost", "best seller", "bestseller",
                "popular", "category", "categories", "whats in stock", "what's in stock");
    }

    private boolean isCatalogListIntent(String text) {
        return containsAny(text, "in stock", "best seller", "bestseller", "popular",
                "category", "categories", "show products", "list products", "what do you have");
    }

    private boolean isProductMode(String mode) {
        return mode != null && mode.trim().equalsIgnoreCase("PRODUCT");
    }

    private boolean containsAny(String text, String... phrases) {
        for (String phrase : phrases) {
            if (phrase.indexOf(' ') >= 0) {
                if (text.contains(phrase)) {
                    return true;
                }
                continue;
            }
            for (String token : text.split("\\s+")) {
                if (token.equals(phrase) || (phrase.length() >= 4 && token.startsWith(phrase))) {
                    return true;
                }
            }
        }
        return false;
    }

    private String normalize(String raw) {
        return raw.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9\\s]", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private BigDecimal firstGroupDecimal(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        if (matcher.find()) {
            return new BigDecimal(matcher.group(1));
        }
        return null;
    }

    private String formatMoney(BigDecimal amount) {
        if (amount == null) {
            return "0 MMK";
        }
        return NumberFormat.getNumberInstance(Locale.US).format(amount.longValue()) + " MMK";
    }
}
