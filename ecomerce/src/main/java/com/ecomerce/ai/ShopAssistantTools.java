package com.ecomerce.ai;

import com.ecomerce.cart.CartService;
import com.ecomerce.dto.BestSellerResponse;
import com.ecomerce.dto.CartResponse;
import com.ecomerce.dto.CategoryResponse;
import com.ecomerce.dto.OrderResponse;
import com.ecomerce.dto.ProductResponse;
import com.ecomerce.entity.User;
import com.ecomerce.repository.UserRepository;
import com.ecomerce.security.CurrentUser;
import com.ecomerce.service.CategoryService;
import com.ecomerce.service.DeliveryZoneService;
import com.ecomerce.service.OrderService;
import com.ecomerce.service.ProductService;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The functions Gemini may call. Every result comes from PostgreSQL at call time.
 *
 * Safety:
 * <ul>
 *   <li>Order and bag tools act only on the signed-in shopper (from the security context),
 *       never on an ID the model supplies, so one customer can never see another's data.</li>
 *   <li>{@code add_to_bag} is the only write. It goes through the normal cart rules
 *       (active product, stock check, quantity limits) and never touches stock.</li>
 *   <li>Results are plain data; the model cannot change prices, stock, or orders.</li>
 * </ul>
 */
@Component
@RequiredArgsConstructor
public class ShopAssistantTools {

    private static final int CATALOG_LIMIT = 500;
    private static final Set<String> STOP = Set.of(
            "a", "an", "the", "for", "and", "or", "of", "to", "in", "on", "with", "any", "some",
            "my", "me", "i", "do", "you", "have", "got", "is", "are", "it", "that", "this", "please");

    private final ProductService productService;
    private final CategoryService categoryService;
    private final DeliveryZoneService deliveryZoneService;
    private final OrderService orderService;
    private final CartService cartService;
    private final UserRepository userRepository;

    /** Function declarations sent to Gemini (OpenAPI-style schemas). */
    public static List<Map<String, Object>> declarations() {
        return List.of(
                fn("search_products",
                        "Search the shop catalog. Use for ANY question about what products exist, prices, stock, "
                                + "recommendations, gift ideas, comparisons or budgets. Pass the shopper's need as short keywords "
                                + "(e.g. 'toy', 'frying pan', 'rice'); synonyms are fine, try a second search with other words if "
                                + "the first finds nothing. Leave query empty to browse.",
                        props(
                                p("query", "string", "Keywords, e.g. 'water bottle' or 'kitchen pan'"),
                                p("category", "string", "Optional category name, e.g. 'Kids'"),
                                p("min_price", "number", "Minimum price in MMK"),
                                p("max_price", "number", "Maximum price in MMK"),
                                p("in_stock_only", "boolean", "Only items that can be bought now"),
                                Map.<String, Object>entry("sort", Map.of("type", "string",
                                        "enum", List.of("relevance", "price_low_to_high", "price_high_to_low", "newest", "most_popular"),
                                        "description", "Result order")),
                                p("limit", "integer", "Max results, 1-12 (default 6)")),
                        List.of()),
                fn("get_product_details", "Full details for one product: description, price, cargo fee, stock, category, units sold.",
                        props(p("product_id", "integer", "Product ID from a search result")), List.of("product_id")),
                fn("list_categories", "All product categories in the shop.", props(), List.of()),
                fn("best_sellers", "Best-selling products (by units sold), in-stock first.",
                        props(p("category", "string", "Optional category name"),
                                p("limit", "integer", "Max results, 1-10 (default 5)")), List.of()),
                fn("delivery_zones", "Townships the shop delivers to, with the delivery fee for each.", props(), List.of()),
                fn("my_orders",
                        "The signed-in shopper's own orders (newest first) with status, items and totals. "
                                + "Use for order tracking, 'where is my order', order history.",
                        props(p("order_id", "integer", "Optional: one specific order number")), List.of()),
                fn("my_bag", "What is in the signed-in shopper's bag (cart) right now, with current prices and availability.",
                        props(), List.of()),
                fn("add_to_bag",
                        "Add a product to the signed-in shopper's bag. Call ONLY when the shopper clearly asks you to add "
                                + "something (e.g. 'add it', 'put 2 in my cart'). Never on your own initiative.",
                        props(p("product_id", "integer", "Product ID"), p("quantity", "integer", "How many, default 1")),
                        List.of("product_id")));
    }

    /** Runs one function call. Never throws: errors come back as {"error": "..."} for the model to explain. */
    public Map<String, Object> call(String name, JsonNode args, ToolTrace trace) {
        try {
            return switch (name) {
                case "search_products" -> searchProducts(args, trace);
                case "get_product_details" -> productDetails(args, trace);
                case "list_categories" -> Map.of("categories", categoryService.getAllCategories().stream()
                        .map(CategoryResponse::getName).toList());
                case "best_sellers" -> bestSellers(args, trace);
                case "delivery_zones" -> Map.of("zones", deliveryZoneService.getActiveZones().stream()
                        .map(z -> Map.of("township", z.getTownName(), "fee_mmk", z.getFee()))
                        .toList());
                case "my_orders" -> myOrders(args, trace);
                case "my_bag" -> myBag(trace);
                case "add_to_bag" -> addToBag(args, trace);
                default -> Map.of("error", "Unknown function " + name);
            };
        } catch (RuntimeException e) {
            String message = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            return Map.of("error", message.length() > 200 ? message.substring(0, 200) : message);
        }
    }

    // ─── Products ────────────────────────────────────────────────────────────

    private Map<String, Object> searchProducts(JsonNode a, ToolTrace trace) {
        String query = text(a, "query").toLowerCase(Locale.ROOT);
        String category = text(a, "category").toLowerCase(Locale.ROOT);
        BigDecimal min = number(a, "min_price");
        BigDecimal max = number(a, "max_price");
        boolean inStockOnly = a != null && a.path("in_stock_only").asBoolean(false);
        String sort = text(a, "sort");
        int limit = clamp(a == null ? 6 : a.path("limit").asInt(6), 1, 12);

        List<String> tokens = tokens(query);
        List<ProductResponse> catalog = productService.getProducts(null, null, null, null, null,
                PageRequest.of(0, CATALOG_LIMIT, Sort.by(Sort.Order.desc("createdAt")))).getContent();

        record Scored(ProductResponse p, int score) {}
        List<Scored> scored = new ArrayList<>();
        for (ProductResponse p : catalog) {
            if (min != null && p.getPrice().compareTo(min) < 0) continue;
            if (max != null && p.getPrice().compareTo(max) > 0) continue;
            if (inStockOnly && (p.getStock() == null || p.getStock() <= 0)) continue;
            String cat = p.getCategoryName() == null ? "" : p.getCategoryName().toLowerCase(Locale.ROOT);
            if (!category.isBlank() && !cat.contains(category) && !category.contains(cat.isBlank() ? "\u0000" : cat)) continue;
            int score = tokens.isEmpty() ? 1 : relevance(p, cat, tokens);
            if (score > 0) scored.add(new Scored(p, score));
        }

        Comparator<Scored> order = switch (sort) {
            case "price_low_to_high" -> Comparator.comparing(s -> s.p().getPrice());
            case "price_high_to_low" -> Comparator.comparing((Scored s) -> s.p().getPrice()).reversed();
            case "newest" -> Comparator.comparing((Scored s) -> s.p().getCreatedAt(),
                    Comparator.nullsLast(Comparator.reverseOrder()));
            case "most_popular" -> Comparator.comparing((Scored s) -> s.p().getUnitsSold() == null ? 0L : s.p().getUnitsSold())
                    .reversed();
            default -> Comparator.comparingInt((Scored s) -> s.score()).reversed();
        };
        // Items that can be bought always come before sold-out ones.
        order = Comparator.comparing((Scored s) -> s.p().getStock() == null || s.p().getStock() <= 0).thenComparing(order);

        List<ProductResponse> results = scored.stream().sorted(order).limit(limit).map(Scored::p).toList();
        results.forEach(trace::seen);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("count", results.size());
        out.put("total_matches", scored.size());
        out.put("products", results.stream().map(ShopAssistantTools::brief).toList());
        if (results.isEmpty()) {
            out.put("note", "Nothing matched. Try other keywords, a broader category, or a higher budget.");
        }
        return out;
    }

    private Map<String, Object> productDetails(JsonNode a, ToolTrace trace) {
        long id = a == null ? 0 : a.path("product_id").asLong(0);
        ProductResponse p = productService.getProductById(id);
        if (!Boolean.TRUE.equals(p.getActive())) {
            return Map.of("error", "That product is no longer sold.");
        }
        trace.seen(p);
        Map<String, Object> out = new LinkedHashMap<>(brief(p));
        out.put("description", p.getDescription() == null ? "" : p.getDescription());
        out.put("cargo_fee_mmk", p.getCargoPrice());
        out.put("units_sold", p.getUnitsSold());
        return out;
    }

    private Map<String, Object> bestSellers(JsonNode a, ToolTrace trace) {
        String category = text(a, "category").toLowerCase(Locale.ROOT);
        int limit = clamp(a == null ? 5 : a.path("limit").asInt(5), 1, 10);
        Long categoryId = null;
        if (!category.isBlank()) {
            categoryId = categoryService.getAllCategories().stream()
                    .filter(c -> c.getName() != null && c.getName().toLowerCase(Locale.ROOT).contains(category))
                    .map(CategoryResponse::getId).findFirst().orElse(null);
        }
        List<BestSellerResponse> list = productService.getBestSellers(categoryId, limit, true);
        List<Map<String, Object>> products = new ArrayList<>();
        for (BestSellerResponse b : list) {
            trace.seen(b.getProductId());
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", b.getProductId());
            m.put("name", b.getName());
            m.put("price_mmk", b.getPrice());
            m.put("in_stock", b.getStock() != null && b.getStock() > 0);
            m.put("stock", b.getStock());
            m.put("category", b.getCategoryName());
            m.put("units_sold", b.getTotalSold());
            products.add(m);
        }
        return Map.of("products", products);
    }

    // ─── Shopper-specific ───────────────────────────────────────────────────

    private Map<String, Object> myOrders(JsonNode a, ToolTrace trace) {
        Optional<User> user = signedIn();
        if (user.isEmpty()) return Map.of("error", "The shopper is not signed in.");
        trace.usedOrders = true;
        List<OrderResponse> orders = orderService.getMyOrders(user.get().getId());
        long wanted = a == null ? 0 : a.path("order_id").asLong(0);
        if (wanted > 0) {
            orders = orders.stream().filter(o -> o.getId() == wanted).toList();
            if (orders.isEmpty()) return Map.of("error", "No order #" + wanted + " on this shopper's account.");
        }
        List<Map<String, Object>> out = orders.stream().limit(5).map(o -> {
            trace.orderIds.add(o.getId());
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("order_id", o.getId());
            m.put("status", o.getStatus());
            m.put("placed", o.getOrderDate() == null ? null : o.getOrderDate().toLocalDate().toString());
            m.put("total_mmk", o.getTotal());
            m.put("delivery_township", o.getTownName());
            m.put("items", o.getItems() == null ? List.of() : o.getItems().stream()
                    .map(i -> i.getProductName() + " x" + i.getQuantity()).toList());
            return m;
        }).collect(Collectors.toList());
        return Map.of("orders", out, "status_meanings",
                "PENDING=received, CONFIRMED=accepted, PROCESSING=packing, SHIPPED=left shop, "
                        + "DELIVERING=out for delivery, DELIVERED=done, CANCELLED=cancelled");
    }

    private Map<String, Object> myBag(ToolTrace trace) {
        Optional<User> user = signedIn();
        if (user.isEmpty()) return Map.of("error", "The shopper is not signed in.");
        trace.usedBag = true;
        return bagSummary(cartService.getCart(user.get().getId()));
    }

    private Map<String, Object> addToBag(JsonNode a, ToolTrace trace) {
        Optional<User> user = signedIn();
        if (user.isEmpty()) return Map.of("error", "The shopper is not signed in.");
        long productId = a == null ? 0 : a.path("product_id").asLong(0);
        int qty = clamp(a == null ? 1 : a.path("quantity").asInt(1), 1, 20);
        CartResponse cart = cartService.addItem(user.get().getId(), productId, qty);
        trace.usedBag = true;
        trace.changedBag = true;
        trace.seen(productId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("added", true);
        out.put("product_id", productId);
        out.put("quantity_added", qty);
        out.put("bag", bagSummary(cart));
        return out;
    }

    private static Map<String, Object> bagSummary(CartResponse cart) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", cart.getItems() == null ? List.of() : cart.getItems().stream().map(i -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("product_id", i.getProductId());
            m.put("name", i.getProductName());
            m.put("quantity", i.getQuantity());
            m.put("unit_price_mmk", i.getUnitPrice());
            m.put("availability", i.getAvailability());
            m.put("price_changed", i.getPriceChanged());
            return m;
        }).toList());
        out.put("total_items", cart.getTotalItems());
        out.put("products_total_mmk", cart.getSubtotal());
        out.put("note", "Delivery fee is added at checkout based on township.");
        return out;
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private Optional<User> signedIn() {
        return CurrentUser.currentEmail().flatMap(userRepository::findByEmail);
    }

    private static Map<String, Object> brief(ProductResponse p) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", p.getId());
        m.put("name", p.getName());
        m.put("price_mmk", p.getPrice());
        m.put("in_stock", p.getStock() != null && p.getStock() > 0);
        m.put("stock", p.getStock());
        m.put("category", p.getCategoryName());
        String d = p.getDescription() == null ? "" : p.getDescription().strip();
        m.put("summary", d.length() > 140 ? d.substring(0, 137) + "..." : d);
        return m;
    }

    private static int relevance(ProductResponse p, String category, List<String> tokens) {
        String name = p.getName() == null ? "" : p.getName().toLowerCase(Locale.ROOT);
        String desc = p.getDescription() == null ? "" : p.getDescription().toLowerCase(Locale.ROOT);
        int score = 0;
        for (String t : tokens) {
            String stem = t.length() > 4 && t.endsWith("s") ? t.substring(0, t.length() - 1) : t;
            if (name.contains(stem)) score += 3;
            else if (category.contains(stem) || stem.contains(category.isBlank() ? "\u0000" : category)) score += 2;
            else if (desc.contains(stem)) score += 1;
        }
        return score;
    }

    private static List<String> tokens(String query) {
        List<String> out = new ArrayList<>();
        for (String t : query.split("[^\\p{L}\\p{N}]+")) {
            if (t.length() >= 2 && !STOP.contains(t)) out.add(t);
        }
        return out;
    }

    private static String text(JsonNode a, String field) {
        return a == null || !a.hasNonNull(field) ? "" : a.get(field).asText("").trim();
    }

    private static BigDecimal number(JsonNode a, String field) {
        return a == null || !a.hasNonNull(field) || !a.get(field).isNumber() ? null : a.get(field).decimalValue();
    }

    private static int clamp(int v, int lo, int hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    @SafeVarargs
    private static Map<String, Object> props(Map.Entry<String, Object>... entries) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : entries) m.put(e.getKey(), e.getValue());
        return m;
    }

    private static Map.Entry<String, Object> p(String name, String type, String description) {
        return Map.<String, Object>entry(name, Map.of("type", type, "description", description));
    }

    private static Map<String, Object> fn(String name, String description, Map<String, Object> properties, List<String> required) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("type", "object");
        params.put("properties", properties);
        if (!required.isEmpty()) params.put("required", required);
        return Map.of("name", name, "description", description, "parameters", params);
    }

    /** What the tools touched during one reply, used to build cards and buttons. */
    public static class ToolTrace {
        final Map<Long, ProductResponse> products = new LinkedHashMap<>();
        final List<Long> productIdsOnly = new ArrayList<>();
        final List<Long> orderIds = new ArrayList<>();
        boolean usedOrders;
        boolean usedBag;
        boolean changedBag;

        void seen(ProductResponse p) {
            if (p != null && p.getId() != null) products.putIfAbsent(p.getId(), p);
        }

        void seen(Long id) {
            if (id != null && !productIdsOnly.contains(id)) productIdsOnly.add(id);
        }
    }
}
