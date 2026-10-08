package com.ecomerce.security;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.math.BigDecimal;
import java.time.temporal.Temporal;
import java.util.Collection;
import java.util.Collections;
import java.util.Date;
import java.util.IdentityHashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Rejects text that looks like a SQL statement. Queries still use bound
 * parameters; this stops those strings from being stored or searched.
 */
public final class SqlInjectionGuard {

    public static final String MESSAGE =
            "That text is not allowed. Remove quotes used as SQL, comments, or SQL commands.";

    private static final Pattern SUSPICIOUS = Pattern.compile(
            "(?i)("
                    + "'\\s*(or|and)\\s+['\\d]"
                    + "|\"\\s*(or|and)\\s+['\"\\d]"
                    + "|'\\s*=\\s*'"
                    + "|\"\\s*=\\s*\""
                    + "|--"
                    + "|/\\*"
                    + "|\\*/"
                    + "|;\\s*(drop|delete|insert|update|alter|create|truncate|exec|execute|union)\\b"
                    + "|\\bunion\\b[\\s\\S]{0,80}\\bselect\\b"
                    + "|\\b(drop|truncate)\\s+(table|database)\\b"
                    + "|\\binsert\\s+into\\b"
                    + "|\\bdelete\\s+from\\b"
                    + "|\\bupdate\\s+\\w+\\s+set\\b"
                    + "|\\bxp_\\w+"
                    + "|\\binformation_schema\\b"
                    + "|\\b(sleep|benchmark)\\s*\\("
                    + "|\\bwaitfor\\s+delay\\b"
                    + ")"
    );

    private SqlInjectionGuard() {
    }

    public static boolean isUnsafe(String value) {
        if (value == null || value.isEmpty()) {
            return false;
        }
        if (value.indexOf('\0') >= 0) {
            return true;
        }
        return SUSPICIOUS.matcher(value).find();
    }

    public static void assertSafe(String value) {
        if (isUnsafe(value)) {
            throw new IllegalArgumentException(MESSAGE);
        }
    }

    public static void assertSafeObject(Object body) {
        walk(body, Collections.newSetFromMap(new IdentityHashMap<>()));
    }

    private static void walk(Object value, Set<Object> seen) {
        if (value == null) {
            return;
        }
        if (value instanceof String text) {
            assertSafe(text);
            return;
        }
        if (isLeaf(value)) {
            return;
        }
        if (!seen.add(value)) {
            return;
        }
        if (value instanceof Collection<?> collection) {
            for (Object item : collection) {
                walk(item, seen);
            }
            return;
        }
        if (value instanceof Map<?, ?> map) {
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                walk(entry.getKey(), seen);
                walk(entry.getValue(), seen);
            }
            return;
        }
        Class<?> type = value.getClass();
        if (type.isArray()) {
            if (!type.getComponentType().isPrimitive()) {
                for (Object item : (Object[]) value) {
                    walk(item, seen);
                }
            }
            return;
        }
        if (!type.getName().startsWith("com.ecomerce.")) {
            return;
        }
        Class<?> current = type;
        while (current != null && current.getName().startsWith("com.ecomerce.")) {
            for (Field field : current.getDeclaredFields()) {
                if (Modifier.isStatic(field.getModifiers())) {
                    continue;
                }
                field.setAccessible(true);
                try {
                    walk(field.get(value), seen);
                } catch (IllegalAccessException ignored) {
                    // Field is not readable; skip it.
                }
            }
            current = current.getSuperclass();
        }
    }

    private static boolean isLeaf(Object value) {
        return value instanceof Number
                || value instanceof Boolean
                || value instanceof Character
                || value instanceof Enum<?>
                || value instanceof Temporal
                || value instanceof Date
                || value instanceof BigDecimal;
    }
}
