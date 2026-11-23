package com.ecomerce.service;

import com.ecomerce.cart.CartService;
import com.ecomerce.dto.CartResponse;
import com.ecomerce.dto.ChatResponse;
import com.ecomerce.dto.DeliveryZoneResponse;
import com.ecomerce.dto.OrderResponse;
import com.ecomerce.dto.ProductResponse;
import com.ecomerce.entity.User;
import com.ecomerce.repository.UserRepository;
import com.ecomerce.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Questions the general product/support matcher cannot answer on its own, because they need
 * the signed-in shopper's data or a specific lookup:
 * <ul>
 *   <li>"where is my order", "status of order #12", "what did I order last time"</li>
 *   <li>"what's in my bag", "how much is my cart"</li>
 *   <li>"how much is delivery to Sanchaung", "do you deliver to Hlaing"</li>
 *   <li>"what's new", "most expensive kettle", "how many products do you have"</li>
 *   <li>"thanks", "bye"</li>
 * </ul>
 * Each skill reads live data (PostgreSQL) and never exposes another customer's information.
 * Returns empty when the message is not for these skills, so the normal matcher runs.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ChatSkills {

    private static final Pattern ORDER_ID = Pattern.compile("(?:order\\s*(?:no\\.?|number|#)?\\s*|#)(\\d{1,9})\\b");
    private static final Pattern MY_ORDER = Pattern.compile(
            "\\b(my|last|latest|recent|previous)\\s+(order|orders|purchase|purchases)\\b"
                    + "|\\b(track|tracking)\\b"
                    + "|\\bwhere(?:'s| is)?\\s+(?:my\\s+)?(?:order|package|parcel|stuff|delivery)\\b"
                    + "|\\border\\s+status\\b|\\bstatus\\s+of\\s+(?:my\\s+)?order\\b"
                    + "|\\bwhat did i (?:order|buy)\\b|\\bwhen will (?:it|my order) (?:arrive|come)\\b");
    private static final Pattern HOW_TO_ORDER = Pattern.compile("\\bhow (?:do|can|to) (?:i )?(?:place|make|create|cancel)\\b");
    private static final Pattern MY_BAG = Pattern.compile(
            "\\b(?:my|in my|in the)\\s+(?:bag|cart|basket)\\b|\\b(?:bag|cart|basket)\\s+(?:total|contents|items)\\b"
                    + "|\\bwhat(?:'s| is| do i have)\\s+in\\s+(?:my\\s+)?(?:bag|cart|basket)\\b");
    private static final Pattern DELIVERY_WORD = Pattern.compile("\\b(deliver|delivery|shipping|ship|fee|send|bring)\\b");
    private static final Pattern NEW_ITEMS = Pattern.compile(
            "\\b(what'?s new|new arrivals?|just arrived|newest|latest (?:products|items|stuff)|anything new|new (?:products|items|stuff|things))\\b");
    private static final Pattern EXPENSIVE = Pattern.compile("\\b(most expensive|priciest|premium|high[- ]end|best quality|top of the line)\\b");
    private static final Pattern COUNT_PRODUCTS = Pattern.compile("\\bhow many (?:products|items|things)\\b");
    private static final Pattern THANKS = Pattern.compile("^(?:thanks?|thank you|thx|ty|cheers|great|ok(?:ay)?|cool|nice)[!. ]*(?:so much|a lot)?[!. ]*$");
    private static final Pattern BYE = Pattern.compile("^(?:bye|goodbye|see you|see ya|good night)[!. ]*$");

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("MMM d", Locale.US);

    private final OrderService orderService;
    private final UserRepository userRepository;
    private final CartService cartService;
    private final DeliveryZoneService deliveryZoneService;
    private final ProductService productService;

    public Optional<ChatResponse> answer(String rawMessage, Function<ProductResponse, ChatResponse.ProductCard> toCard) {
        if (rawMessage == null || rawMessage.isBlank()) return Optional.empty();
        String text = rawMessage.toLowerCase(Locale.ROOT).replace('’', '\'').trim();

        if (THANKS.matcher(text).matches()) {
            return Optional.of(simple("You're welcome! Anything else I can find for you?",
                    List.of("What's new?", "Track my order", "What's in my bag?")));
        }
        if (BYE.matcher(text).matches()) {
            return Optional.of(simple("Bye for now. Your bag will be here when you come back.", List.of()));
        }
        if (!HOW_TO_ORDER.matcher(text).find()) {
            Matcher id = ORDER_ID.matcher(text);
            boolean asksOrder = MY_ORDER.matcher(text).find() || (id.find() && text.contains("order"));
            if (asksOrder) return Optional.of(orders(text));
        }
        if (MY_BAG.matcher(text).find()) {
            return Optional.of(bag());
        }
        Optional<ChatResponse> delivery = deliveryTo(text);
        if (delivery.isPresent()) return delivery;
        if (NEW_ITEMS.matcher(text).find()) {
            return Optional.of(productList("Here's what arrived most recently. In-stock items first.",
                    Sort.by(Sort.Order.desc("inStockRank"), Sort.Order.desc("createdAt")), toCard,
                    List.of("What are the best sellers?", "Show me something cheap", "What categories do you have?")));
        }
        if (EXPENSIVE.matcher(text).find()) {
            return Optional.of(productList("Our highest-priced items that are in stock right now:",
                    Sort.by(Sort.Order.desc("price")), toCard,
                    List.of("Show me something cheap", "What's new?", "What are the best sellers?")));
        }
        if (COUNT_PRODUCTS.matcher(text).find()) {
            long total = productService.getProducts(null, null, null, null, null, PageRequest.of(0, 1)).getTotalElements();
            long inStock = productService.getProducts(null, null, null, null, true, PageRequest.of(0, 1)).getTotalElements();
            return Optional.of(ChatResponse.builder()
                    .reply("The shop lists " + total + " products right now, and " + inStock + " of them are in stock.")
                    .mode("PRODUCT")
                    .suggestions(List.of("What categories do you have?", "What's new?", "What are the best sellers?"))
                    .actions(List.of(new ChatResponse.Action("Browse all products", "/products")))
                    .build());
        }
        return Optional.empty();
    }

    // ─── Orders ──────────────────────────────────────────────────────────────

    private ChatResponse orders(String text) {
        Optional<User> user = signedInUser();
        if (user.isEmpty()) {
            return ChatResponse.builder()
                    .reply("Sign in and I can tell you exactly where your orders are.")
                    .mode("SUPPORT")
                    .actions(List.of(new ChatResponse.Action("Sign in", "/login")))
                    .build();
        }
        List<OrderResponse> orders = orderService.getMyOrders(user.get().getId());
        if (orders.isEmpty()) {
            return ChatResponse.builder()
                    .reply("You haven't placed any orders yet. When you do, I can track them for you here.")
                    .mode("SUPPORT")
                    .suggestions(List.of("What are the best sellers?", "What's new?"))
                    .actions(List.of(new ChatResponse.Action("Start shopping", "/products")))
                    .build();
        }

        Matcher m = ORDER_ID.matcher(text);
        if (m.find()) {
            long wanted = Long.parseLong(m.group(1));
            Optional<OrderResponse> match = orders.stream().filter(o -> o.getId() == wanted).findFirst();
            if (match.isEmpty()) {
                // Never confirm whether someone else's order exists.
                return ChatResponse.builder()
                        .reply("I couldn't find order #" + wanted + " on your account. Here are your most recent ones.")
                        .mode("SUPPORT")
                        .suggestions(List.of("Track my last order"))
                        .actions(List.of(new ChatResponse.Action("See all my orders", "/orders")))
                        .build();
            }
            return orderReply(match.get(), "");
        }

        boolean wantsList = text.contains("orders") || text.contains("purchases") || text.contains("what did i");
        if (wantsList && orders.size() > 1) {
            StringBuilder reply = new StringBuilder("Your recent orders:\n");
            orders.stream().limit(3).forEach(o -> reply.append("• #").append(o.getId()).append(" · ")
                    .append(statusLabel(o.getStatus())).append(" · ").append(money(o.getTotal()))
                    .append(o.getOrderDate() == null ? "" : " · " + o.getOrderDate().format(DATE)).append('\n'));
            List<ChatResponse.Action> actions = new ArrayList<>();
            actions.add(new ChatResponse.Action("Open order #" + orders.get(0).getId(), "/receipt/" + orders.get(0).getId()));
            actions.add(new ChatResponse.Action("See all orders", "/orders"));
            return ChatResponse.builder()
                    .reply(reply.toString().trim())
                    .mode("SUPPORT")
                    .suggestions(List.of("Where is order #" + orders.get(0).getId() + "?", "What's in my bag?"))
                    .actions(actions)
                    .build();
        }
        return orderReply(orders.get(0), "Your latest order: ");
    }

    private ChatResponse orderReply(OrderResponse order, String prefix) {
        int items = order.getItems() == null ? 0 : order.getItems().stream().mapToInt(i -> i.getQuantity() == null ? 0 : i.getQuantity()).sum();
        String what = order.getItems() == null || order.getItems().isEmpty() ? ""
                : order.getItems().get(0).getProductName()
                + (order.getItems().size() > 1 ? " and " + (order.getItems().size() - 1) + " more" : "");
        String reply = prefix + "order #" + order.getId() + " is " + statusLabel(order.getStatus()).toLowerCase(Locale.ROOT) + ". "
                + statusHint(order.getStatus()) + " "
                + items + (items == 1 ? " item" : " items") + (what.isBlank() ? "" : " (" + what + ")")
                + ", total " + money(order.getTotal())
                + (order.getTownName() == null ? "" : ", delivering to " + order.getTownName()) + ".";
        return ChatResponse.builder()
                .reply(Character.toUpperCase(reply.charAt(0)) + reply.substring(1))
                .mode("SUPPORT")
                .suggestions(List.of("Show my recent orders", "What's in my bag?"))
                .actions(List.of(new ChatResponse.Action("Open receipt", "/receipt/" + order.getId()),
                        new ChatResponse.Action("All orders", "/orders")))
                .build();
    }

    private static String statusLabel(String status) {
        if (status == null || status.isBlank()) return "Pending";
        return status.charAt(0) + status.substring(1).toLowerCase(Locale.ROOT);
    }

    private static String statusHint(String status) {
        return switch (status == null ? "" : status) {
            case "PENDING" -> "We've received it and will confirm it soon.";
            case "CONFIRMED" -> "It's confirmed and will be packed next.";
            case "PROCESSING" -> "It's being packed now.";
            case "SHIPPED" -> "It has left the shop.";
            case "DELIVERING" -> "It's on the way to you today.";
            case "DELIVERED" -> "It has been delivered.";
            case "CANCELLED" -> "It was cancelled, so nothing will be delivered.";
            default -> "";
        };
    }

    // ─── Bag ─────────────────────────────────────────────────────────────────

    private ChatResponse bag() {
        Optional<User> user = signedInUser();
        if (user.isEmpty()) {
            return simple("Sign in to see your bag.", List.of());
        }
        CartResponse cart;
        try {
            cart = cartService.getCart(user.get().getId());
        } catch (RuntimeException e) {
            return simple("I can't open your bag right this second. Please try again shortly.", List.of());
        }
        if (cart.getItems() == null || cart.getItems().isEmpty()) {
            return ChatResponse.builder()
                    .reply("Your bag is empty. Want some ideas?")
                    .mode("SUPPORT")
                    .suggestions(List.of("What are the best sellers?", "What's new?", "Show me something cheap"))
                    .build();
        }
        StringBuilder reply = new StringBuilder("In your bag (" + cart.getTotalItems() + (cart.getTotalItems() == 1 ? " item" : " items") + "):\n");
        cart.getItems().forEach(i -> reply.append("• ").append(i.getProductName()).append(" × ").append(i.getQuantity())
                .append(Boolean.TRUE.equals(i.getAvailable()) ? " · " + money(i.getLineTotal()) : " · not available").append('\n'));
        reply.append("Products total: ").append(money(cart.getSubtotal())).append(". Delivery is added at checkout.");
        if (cart.isHasPriceChanges()) reply.append(" Some prices changed since you added them.");
        if (cart.isHasUnavailableItems()) reply.append(" Some items need your attention before checkout.");
        return ChatResponse.builder()
                .reply(reply.toString())
                .mode("SUPPORT")
                .suggestions(List.of("How much is delivery?", "Track my last order"))
                .actions(List.of(new ChatResponse.Action("Open bag", "#bag"), new ChatResponse.Action("Checkout", "/checkout")))
                .build();
    }

    // ─── Delivery to a named township ───────────────────────────────────────

    private Optional<ChatResponse> deliveryTo(String text) {
        if (!DELIVERY_WORD.matcher(text).find()) return Optional.empty();
        List<DeliveryZoneResponse> zones = deliveryZoneService.getActiveZones();
        for (DeliveryZoneResponse zone : zones) {
            String town = zone.getTownName() == null ? "" : zone.getTownName().toLowerCase(Locale.ROOT).trim();
            if (!town.isEmpty() && text.contains(town)) {
                return Optional.of(ChatResponse.builder()
                        .reply("Yes, we deliver to " + zone.getTownName() + ". The delivery fee is " + money(zone.getFee())
                                + ", added once per order at checkout.")
                        .mode("SUPPORT")
                        .suggestions(List.of("Which townships do you deliver to?", "What's in my bag?"))
                        .actions(List.of(new ChatResponse.Action("Go to checkout", "/checkout")))
                        .build());
            }
        }
        Matcher to = Pattern.compile("\\b(?:to|in)\\s+([a-z][a-z ]{2,30}?)\\s*\\??$").matcher(text);
        if (to.find() && !zones.isEmpty() && !to.group(1).matches("(?:me|my|you|your|home|house|the shop|checkout|yangon)")) {
            String names = zones.stream().map(DeliveryZoneResponse::getTownName).reduce((a, b) -> a + ", " + b).orElse("");
            return Optional.of(simple("I don't see \"" + to.group(1).trim() + "\" in our delivery townships yet. We currently deliver to: "
                    + names + ".", List.of("Which townships do you deliver to?")));
        }
        return Optional.empty();
    }

    // ─── Product lists ───────────────────────────────────────────────────────

    private ChatResponse productList(String intro, Sort sort, Function<ProductResponse, ChatResponse.ProductCard> toCard,
                                     List<String> suggestions) {
        List<ProductResponse> items = productService.getProducts(null, null, null, null, true, PageRequest.of(0, 4, sort)).getContent();
        if (items.isEmpty()) {
            return simple("Nothing is in stock right now. Please check back soon.", List.of("What categories do you have?"));
        }
        return ChatResponse.builder()
                .reply(intro)
                .mode("PRODUCT")
                .products(items.stream().map(toCard).toList())
                .suggestions(suggestions)
                .actions(List.of(new ChatResponse.Action("See more", "/products")))
                .build();
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private Optional<User> signedInUser() {
        return CurrentUser.currentEmail().flatMap(userRepository::findByEmail);
    }

    private static ChatResponse simple(String reply, List<String> suggestions) {
        return ChatResponse.builder().reply(reply).mode("SUPPORT").suggestions(suggestions).build();
    }

    private static String money(BigDecimal amount) {
        return NumberFormat.getNumberInstance(Locale.US).format(amount == null ? 0 : amount.longValue()) + " MMK";
    }
}
