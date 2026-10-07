package com.ecomerce.service;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ChatLanguageTest {

    @Test
    void understandsParaphrasesWithoutExactCommands() {
        assertEquals(ChatLanguage.Intent.CHECKOUT, intent("how can I buy something from you"));
        assertEquals(ChatLanguage.Intent.CHECKOUT, intent("How do I place an order?"));
        assertEquals(ChatLanguage.Intent.ORDERS, intent("yo where is my package"));
        assertEquals(ChatLanguage.Intent.ORDERS, intent("Where are my orders?"));
        assertEquals(ChatLanguage.Intent.DELIVERY, intent("do u deliver to yangon"));
        assertEquals(ChatLanguage.Intent.DELIVERY, intent("How does delivery work?"));
        assertEquals(ChatLanguage.Intent.REGISTER, intent("i need a new account"));
        assertEquals(ChatLanguage.Intent.LOGIN, intent("I can't sign in with google"));
        assertEquals(ChatLanguage.Intent.CHEAP, intent("what's the cheapest thing you have"));
        assertEquals(ChatLanguage.Intent.BEST_SELLERS, intent("show me your best selling stuff"));
        assertEquals(ChatLanguage.Intent.BEST_SELLERS, intent("What are the best sellers?"));
        assertEquals(ChatLanguage.Intent.LIST_STOCK, intent("What's in stock right now?"));
        assertEquals(ChatLanguage.Intent.CATEGORIES, intent("What categories do you have?"));
        assertEquals(ChatLanguage.Intent.PAYMENT, intent("can I pay with cash"));
        assertEquals(ChatLanguage.Intent.THEME, intent("turn on dark mode"));
        assertEquals(ChatLanguage.Intent.HELP, intent("How do I use ShopNow?"));
        assertEquals(ChatLanguage.Intent.CART, intent("where's my cart"));
    }

    @Test
    void fixesSmallTyposBeforeScoring() {
        String fixed = ChatLanguage.correct(ChatLanguage.normalize("chekout pls"), Set.of());
        assertEquals(ChatLanguage.Intent.CHECKOUT, ChatLanguage.best(ChatLanguage.score(fixed)));

        String product = ChatLanguage.correct(
                ChatLanguage.normalize("is the wirless mouse availble"),
                Set.of("wireless", "mouse"));
        assertTrue(product.contains("wireless"));
        assertTrue(product.contains("available"));
        assertTrue(ChatLanguage.mentionScore(product, "Wireless Mouse") >= 50);
        assertEquals("wireless mouse", ChatLanguage.extractQuery(product));
    }

    @Test
    void followUpsAreShortAndPronounBased() {
        assertTrue(ChatLanguage.isFollowUp(ChatLanguage.normalize("how much?")));
        assertTrue(ChatLanguage.isFollowUp(ChatLanguage.normalize("is this still available?")));
        assertFalse(ChatLanguage.isFollowUp(ChatLanguage.normalize("hello")));
        assertFalse(ChatLanguage.isFollowUp(ChatLanguage.normalize("how much is the wireless mouse")));
    }

    @Test
    void readsPricesWrittenCasually() {
        ChatLanguage.Prices under = ChatLanguage.prices(ChatLanguage.normalize("anything under 20k"));
        assertEquals(new BigDecimal("20000"), under.max());
        assertNull(under.min());

        ChatLanguage.Prices between = ChatLanguage.prices(ChatLanguage.normalize("between 5,000 and 15,000"));
        assertEquals(new BigDecimal("5000"), between.min());
        assertEquals(new BigDecimal("15000"), between.max());
    }

    private static ChatLanguage.Intent intent(String message) {
        String text = ChatLanguage.correct(ChatLanguage.normalize(message), Set.of());
        return ChatLanguage.best(ChatLanguage.score(text));
    }
}
