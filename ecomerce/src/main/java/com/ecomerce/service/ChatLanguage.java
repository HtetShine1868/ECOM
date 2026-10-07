package com.ecomerce.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Collection;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Turns casual shopper messages into an intent and a product query.
 * Wording does not have to match a fixed command: paraphrases, plurals,
 * and small typos still map to the same meaning.
 */
final class ChatLanguage {

    enum Intent {
        GREETING, REGISTER, LOGIN, CHECKOUT, CART, DELIVERY, ORDERS,
        BROWSE, PAYMENT, ADMIN, THEME, HELP,
        CATEGORIES, BEST_SELLERS, CHEAP, LIST_STOCK
    }

    record Prices(BigDecimal min, BigDecimal max) {
        boolean bounded() {
            return min != null || max != null;
        }
    }

    private record Cue(String phrase, int weight) {
    }

    static final int MIN_SCORE = 4;

    private static final Set<String> STOP_WORDS = Set.of(
            "a", "an", "the", "is", "are", "am", "was", "were", "be", "been",
            "do", "does", "did", "didnt", "you", "your", "yours", "u", "ur", "me", "my", "i", "we",
            "im", "ive", "id", "dont", "cant", "wont", "whats", "whos", "hows",
            "can", "could", "would", "should", "please", "pls", "tell", "about",
            "still", "stil", "any", "some", "got", "have", "has", "had",
            "now", "currently", "right", "just", "really", "very", "also",
            "how", "much", "many", "what", "which", "where", "when", "why", "who",
            "price", "cost", "costs", "priced",
            "product", "products", "item", "items", "thing", "things", "stuff",
            "show", "find", "search", "look", "looking", "for", "get", "getting",
            "want", "wanted", "wanna", "need", "needed", "like", "one", "ones",
            "in", "of", "on", "at", "to", "and", "or", "if", "there", "from",
            "this", "that", "these", "those", "hello", "hi", "hey", "yo",
            "thanks", "thank", "thx", "shopnow", "shop", "store",
            "under", "below", "over", "above", "than", "less", "more",
            "between", "mmk", "kyat", "ks", "yes", "no", "ok", "okay", "yeah", "yep",
            "with", "without", "into", "onto", "up", "out", "off", "so", "too",
            "gonna", "lemme", "gimme", "kinda", "guys", "someone", "anyone",
            "anything", "everything", "something", "anymore",
            "us", "our", "let", "know", "wasnt",
            "work", "works", "working", "use", "using", "make", "making"
    );

    private static final Map<Intent, List<Cue>> CUES = cues();
    private static final Set<String> INTENT_WORDS = intentWords();
    private static final Intent[] PRIORITY = {
            Intent.BEST_SELLERS, Intent.CATEGORIES, Intent.CHEAP, Intent.LIST_STOCK,
            Intent.CHECKOUT, Intent.ORDERS, Intent.DELIVERY, Intent.CART, Intent.PAYMENT,
            Intent.REGISTER, Intent.LOGIN, Intent.ADMIN, Intent.THEME, Intent.BROWSE,
            Intent.HELP, Intent.GREETING
    };

    private static final Pattern BETWEEN = Pattern.compile(
            "(?:between|from)\\s+(\\d{3,9})\\s+(?:and|to)\\s+(\\d{3,9})");
    private static final Pattern UNDER = Pattern.compile(
            "(?:under|below|less than|cheaper than|max|maximum|up to|within|no more than|not more than|budget)\\s+(\\d{3,9})");
    private static final Pattern OVER = Pattern.compile(
            "(?:over|above|more than|min|minimum|at least|starting at|from)\\s+(\\d{3,9})");
    private static final Pattern AROUND = Pattern.compile(
            "(?:around|about|near|roughly|approximately|approx)\\s+(\\d{3,9})");
    private static final Pattern THOUSANDS = Pattern.compile("\\b(\\d{1,6})\\s*k\\b");

    private ChatLanguage() {
    }

    static String normalize(String raw) {
        if (raw == null || raw.isBlank()) {
            return "";
        }
        String text = raw.toLowerCase(Locale.ROOT)
                .replace("'", "")
                .replace("’", "")
                .replace("`", "");
        while (text.matches(".*\\d,\\d{3}.*")) {
            text = text.replaceAll("(\\d),(\\d{3})", "$1$2");
        }
        Matcher thousands = THOUSANDS.matcher(text);
        StringBuilder expanded = new StringBuilder();
        while (thousands.find()) {
            long value = Long.parseLong(thousands.group(1)) * 1000L;
            thousands.appendReplacement(expanded, Long.toString(value));
        }
        thousands.appendTail(expanded);
        return expanded.toString()
                .replaceAll("[^a-z0-9\\s]", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    /** Pull misspelled words toward catalog names or known intents when the edit is small. */
    static String correct(String normalized, Set<String> vocabulary) {
        if (normalized.isBlank()) {
            return normalized;
        }
        StringBuilder out = new StringBuilder();
        for (String token : normalized.split(" ")) {
            if (out.length() > 0) {
                out.append(' ');
            }
            out.append(fixToken(token, vocabulary));
        }
        return out.toString();
    }

    static Map<Intent, Integer> score(String text) {
        EnumMap<Intent, Integer> scores = new EnumMap<>(Intent.class);
        for (Intent intent : Intent.values()) {
            int total = 0;
            for (Cue cue : CUES.getOrDefault(intent, List.of())) {
                if (cueMatches(text, cue.phrase())) {
                    total += cue.weight();
                }
            }
            if (total > 0) {
                scores.put(intent, total);
            }
        }
        return scores;
    }

    static Intent best(Map<Intent, Integer> scores) {
        Intent winner = null;
        int winnerScore = 0;
        for (Intent intent : PRIORITY) {
            int value = scores.getOrDefault(intent, 0);
            if (value > winnerScore) {
                winner = intent;
                winnerScore = value;
            }
        }
        return winnerScore >= MIN_SCORE ? winner : null;
    }

    static Prices prices(String text) {
        Matcher between = BETWEEN.matcher(text);
        if (between.find()) {
            BigDecimal left = new BigDecimal(between.group(1));
            BigDecimal right = new BigDecimal(between.group(2));
            return left.compareTo(right) <= 0 ? new Prices(left, right) : new Prices(right, left);
        }
        BigDecimal max = firstAmount(UNDER, text);
        BigDecimal min = firstAmount(OVER, text);
        if (max == null && min == null) {
            Matcher around = AROUND.matcher(text);
            if (around.find()) {
                BigDecimal value = new BigDecimal(around.group(1));
                min = value.multiply(new BigDecimal("0.8")).setScale(0, RoundingMode.HALF_UP);
                max = value.multiply(new BigDecimal("1.2")).setScale(0, RoundingMode.HALF_UP);
            }
        }
        return new Prices(min, max);
    }

    static String extractQuery(String text) {
        StringBuilder query = new StringBuilder();
        for (String token : text.split(" ")) {
            if (token.isBlank() || token.length() < 2 || token.chars().allMatch(Character::isDigit)) {
                continue;
            }
            if (STOP_WORDS.contains(token) || INTENT_WORDS.contains(token)) {
                continue;
            }
            if (query.length() > 0) {
                query.append(' ');
            }
            query.append(token);
        }
        return query.toString();
    }

    static boolean isFollowUp(String text) {
        if (text.isBlank()) {
            return false;
        }
        String[] tokens = text.split(" ");
        boolean pronoun = false;
        for (String token : tokens) {
            if (token.equals("it") || token.equals("that") || token.equals("this")
                    || token.equals("them") || token.equals("those") || token.equals("same")
                    || token.equals("another") || token.equals("else")) {
                pronoun = true;
                break;
            }
        }
        if (pronoun && tokens.length <= 12 && extractQuery(text).isBlank()) {
            return true;
        }
        if (tokens.length > 6 || !extractQuery(text).isBlank()) {
            return false;
        }
        return text.contains("how much")
                || tokenHits(text, "price")
                || tokenHits(text, "cost")
                || tokenHits(text, "available")
                || tokenHits(text, "stock")
                || text.contains("cheap");
    }

    static boolean isHowTo(Intent intent) {
        return switch (intent) {
            case GREETING, REGISTER, LOGIN, CHECKOUT, CART, DELIVERY, ORDERS,
                    BROWSE, PAYMENT, ADMIN, THEME, HELP -> true;
            case CATEGORIES, BEST_SELLERS, CHEAP, LIST_STOCK -> false;
        };
    }

    static int mentionScore(String text, String name) {
        String normalized = normalize(name);
        if (normalized.length() >= 3 && text.contains(normalized)) {
            return 100;
        }
        int content = 0;
        int contentHits = 0;
        for (String part : normalized.split(" ")) {
            if (part.length() < 3 || STOP_WORDS.contains(part) || INTENT_WORDS.contains(part)) {
                continue;
            }
            content++;
            if (tokenHits(text, part)) {
                contentHits++;
            }
        }
        if (contentHits == 0 || content == 0) {
            return 0;
        }
        int score = contentHits * 40;
        if (contentHits == content) {
            score += 30;
        } else {
            score += 15;
        }
        return score;
    }

    static boolean isStopWord(String token) {
        return STOP_WORDS.contains(token);
    }

    private static String fixToken(String token, Set<String> vocabulary) {
        if (token.length() < 4
                || STOP_WORDS.contains(token)
                || INTENT_WORDS.contains(token)
                || vocabulary.contains(token)
                || token.chars().allMatch(Character::isDigit)) {
            return token;
        }
        int max = token.length() >= 8 ? 2 : 1;
        String catalog = closest(token, vocabulary, max);
        String intent = closest(token, INTENT_WORDS, max);
        if (catalog == null) {
            return intent == null ? token : intent;
        }
        if (intent == null) {
            return catalog;
        }
        int catalogDistance = editDistance(token, catalog, max);
        int intentDistance = editDistance(token, intent, max);
        if (catalogDistance < intentDistance) {
            return catalog;
        }
        if (intentDistance < catalogDistance) {
            return intent;
        }
        return token;
    }

    private static boolean cueMatches(String text, String phrase) {
        if (!phrase.contains(" ")) {
            return tokenHits(text, phrase);
        }
        if (text.contains(phrase)) {
            return true;
        }
        int required = 0;
        int hits = 0;
        for (String word : phrase.split(" ")) {
            if (word.length() < 3 || STOP_WORDS.contains(word)) {
                continue;
            }
            required++;
            if (tokenHits(text, word)) {
                hits++;
            }
        }
        // A phrase like "my order" only has one content word, so it must appear as written.
        return required >= 2 && hits == required;
    }

    private static boolean tokenHits(String text, String word) {
        for (String token : text.split(" ")) {
            if (sameWord(token, word)) {
                return true;
            }
        }
        return false;
    }

    private static boolean sameWord(String token, String word) {
        if (token.equals(word) || stem(token).equals(stem(word))) {
            return true;
        }
        return (token.equals("mice") && word.equals("mouse"))
                || (token.equals("mouse") && word.equals("mice"));
    }

    private static String stem(String word) {
        if (word.length() > 4 && word.endsWith("ies")) {
            return word.substring(0, word.length() - 3) + "y";
        }
        if (word.length() > 5 && word.endsWith("es") && !word.endsWith("ss")) {
            return word.substring(0, word.length() - 2);
        }
        if (word.length() > 4 && word.endsWith("s") && !word.endsWith("ss")) {
            return word.substring(0, word.length() - 1);
        }
        return word;
    }

    private static String closest(String token, Collection<String> options, int maxDist) {
        String best = null;
        int bestDist = maxDist + 1;
        int ties = 0;
        for (String option : options) {
            if (option.length() < 4 || Math.abs(option.length() - token.length()) > maxDist) {
                continue;
            }
            int distance = editDistance(token, option, maxDist);
            if (distance < bestDist) {
                bestDist = distance;
                best = option;
                ties = 1;
            } else if (distance == bestDist) {
                ties++;
            }
        }
        return ties == 1 && bestDist <= maxDist ? best : null;
    }

    private static int editDistance(String left, String right, int max) {
        if (Math.abs(left.length() - right.length()) > max) {
            return max + 1;
        }
        int[] prev = new int[right.length() + 1];
        int[] curr = new int[right.length() + 1];
        for (int j = 0; j <= right.length(); j++) {
            prev[j] = j;
        }
        for (int i = 1; i <= left.length(); i++) {
            curr[0] = i;
            int rowMin = curr[0];
            for (int j = 1; j <= right.length(); j++) {
                int cost = left.charAt(i - 1) == right.charAt(j - 1) ? 0 : 1;
                curr[j] = Math.min(Math.min(curr[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
                rowMin = Math.min(rowMin, curr[j]);
            }
            if (rowMin > max) {
                return max + 1;
            }
            int[] swap = prev;
            prev = curr;
            curr = swap;
        }
        return prev[right.length()];
    }

    private static BigDecimal firstAmount(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        if (matcher.find()) {
            return new BigDecimal(matcher.group(1));
        }
        return null;
    }

    private static Set<String> intentWords() {
        Set<String> words = new HashSet<>();
        for (List<Cue> cues : CUES.values()) {
            for (Cue cue : cues) {
                for (String word : cue.phrase().split(" ")) {
                    if (word.length() >= 4 && !STOP_WORDS.contains(word)) {
                        words.add(word);
                    }
                }
            }
        }
        return Set.copyOf(words);
    }

    private static Map<Intent, List<Cue>> cues() {
        EnumMap<Intent, List<Cue>> map = new EnumMap<>(Intent.class);
        map.put(Intent.GREETING, List.of(
                cue("hello", 5), cue("hi", 5), cue("hey", 5), cue("yo", 4),
                cue("howdy", 5), cue("hiya", 5), cue("good morning", 5),
                cue("good afternoon", 5), cue("good evening", 5), cue("whats up", 5)
        ));
        map.put(Intent.REGISTER, List.of(
                cue("register", 6), cue("signup", 6), cue("sign up", 6),
                cue("create account", 6), cue("new account", 6), cue("make an account", 6),
                cue("open an account", 6), cue("need an account", 6), cue("join", 4)
        ));
        map.put(Intent.LOGIN, List.of(
                cue("login", 6), cue("log in", 6), cue("signin", 6), cue("sign in", 6),
                cue("google", 5), cue("facebook", 5), cue("password", 4),
                cue("forgot password", 6), cue("oauth", 5)
        ));
        map.put(Intent.CHECKOUT, List.of(
                cue("checkout", 6), cue("check out", 6), cue("place order", 6),
                cue("place an order", 6), cue("how to order", 6), cue("how do i order", 6),
                cue("how can i order", 6), cue("how do i buy", 6), cue("how can i buy", 6),
                cue("want to buy", 5), cue("want to order", 5), cue("purchase", 5),
                cue("buy", 4), cue("order", 3)
        ));
        map.put(Intent.CART, List.of(
                cue("cart", 6), cue("basket", 5), cue("add to cart", 6),
                cue("shopping cart", 6), cue("my cart", 6), cue("quantity", 4)
        ));
        map.put(Intent.DELIVERY, List.of(
                cue("deliver", 5), cue("delivery", 6), cue("shipping", 6), cue("ship", 4),
                cue("township", 5), cue("cargo", 5), cue("delivery fee", 6),
                cue("shipping fee", 6), cue("do you deliver", 6), cue("do you ship", 6),
                cue("where do you deliver", 6)
        ));
        map.put(Intent.ORDERS, List.of(
                cue("my order", 6), cue("my orders", 6), cue("order history", 6),
                cue("order status", 6), cue("track", 5), cue("tracking", 5),
                cue("receipt", 5), cue("where is my order", 6), cue("package", 4),
                cue("parcel", 5), cue("shipped", 4), cue("past order", 5)
        ));
        map.put(Intent.BROWSE, List.of(
                cue("filter", 4), cue("sort", 4), cue("browse", 4),
                cue("how to search", 5), cue("how do i search", 5)
        ));
        map.put(Intent.PAYMENT, List.of(
                cue("payment", 6), cue("pay", 4), cue("cash", 4), cue("card", 3),
                cue("wallet", 4), cue("cash on delivery", 6), cue("how to pay", 6),
                cue("how do i pay", 6)
        ));
        map.put(Intent.ADMIN, List.of(
                cue("admin", 6), cue("dashboard", 5), cue("analytics", 5),
                cue("manage product", 5)
        ));
        map.put(Intent.THEME, List.of(
                cue("dark mode", 6), cue("light mode", 6), cue("night mode", 6),
                cue("dark theme", 6), cue("light theme", 6), cue("theme", 4)
        ));
        map.put(Intent.HELP, List.of(
                cue("help", 5), cue("guide", 5), cue("how to use", 6),
                cue("how do i use", 6), cue("what can you", 5), cue("how does this work", 6),
                cue("i need help", 6), cue("confused", 4)
        ));
        map.put(Intent.CATEGORIES, List.of(
                cue("category", 6), cue("categories", 6), cue("what kinds", 5),
                cue("what types", 5), cue("types of products", 5)
        ));
        map.put(Intent.BEST_SELLERS, List.of(
                cue("best seller", 6), cue("bestseller", 6), cue("best selling", 6),
                cue("top selling", 6), cue("most sold", 6), cue("most popular", 6),
                cue("most bought", 6), cue("trending", 5), cue("recommend", 5),
                cue("suggestion", 5), cue("what should i buy", 6), cue("popular", 4)
        ));
        map.put(Intent.CHEAP, List.of(
                cue("cheap", 5), cue("cheaper", 5), cue("cheapest", 6), cue("lowest price", 6),
                cue("affordable", 5), cue("inexpensive", 5), cue("bargain", 4),
                cue("on a budget", 6), cue("budget", 4)
        ));
        map.put(Intent.LIST_STOCK, List.of(
                cue("in stock", 5), cue("whats in stock", 6),                 cue("what do you have", 6), cue("what do you sell", 6), cue("what you sell", 6),
                cue("show products", 5), cue("list products", 5),
                cue("anything available", 5), cue("what can i buy", 5),
                cue("whats for sale", 5), cue("whats available", 5)
        ));
        return Map.copyOf(map);
    }

    private static Cue cue(String phrase, int weight) {
        return new Cue(phrase, weight);
    }
}
