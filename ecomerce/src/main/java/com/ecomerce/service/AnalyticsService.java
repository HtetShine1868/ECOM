package com.ecomerce.service;

import com.ecomerce.dto.AnalyticsResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Aggregates store analytics in the database. Revenue counts confirmed
 * through delivered orders only. Cancelled and still-pending orders are
 * reported separately and are not treated as completed sales.
 */
@Service
@RequiredArgsConstructor
public class AnalyticsService {

    private static final List<String> REVENUE_STATUSES = List.of(
            "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERING", "DELIVERED");

    private final NamedParameterJdbcTemplate jdbc;

    public AnalyticsResponse summarize(String range, LocalDate customFrom, LocalDate customTo, int lowStockThreshold) {
        Window window = resolve(range, customFrom, customTo);
        int threshold = Math.min(Math.max(lowStockThreshold, 0), 1000);
        MapSqlParameterSource revenue = params(window).addValue("statuses", REVENUE_STATUSES);
        MapSqlParameterSource all = params(window);

        BigDecimal totalRevenue = money(jdbc.queryForObject("""
                SELECT COALESCE(SUM(oi.unit_price * oi.quantity), 0)
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                WHERE o.status IN (:statuses)
                  AND o.order_date >= :fromTs AND o.order_date < :toTs
                """, revenue, BigDecimal.class));

        long revenueOrders = count("""
                SELECT COUNT(*) FROM orders o
                WHERE o.status IN (:statuses)
                  AND o.order_date >= :fromTs AND o.order_date < :toTs
                """, revenue);

        long unitsSold = count("""
                SELECT COALESCE(SUM(oi.quantity), 0)
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                WHERE o.status IN (:statuses)
                  AND o.order_date >= :fromTs AND o.order_date < :toTs
                """, revenue);

        long cancelledOrders = count("""
                SELECT COUNT(*) FROM orders o
                WHERE o.status = 'CANCELLED'
                  AND o.order_date >= :fromTs AND o.order_date < :toTs
                """, all);
        BigDecimal cancelledRevenue = money(jdbc.queryForObject("""
                SELECT COALESCE(SUM(oi.unit_price * oi.quantity), 0)
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                WHERE o.status = 'CANCELLED'
                  AND o.order_date >= :fromTs AND o.order_date < :toTs
                """, all, BigDecimal.class));
        long allOrders = count("""
                SELECT COUNT(*) FROM orders o
                WHERE o.order_date >= :fromTs AND o.order_date < :toTs
                """, all);
        long delivered = count("""
                SELECT COUNT(*) FROM orders o
                WHERE o.status = 'DELIVERED'
                  AND o.order_date >= :fromTs AND o.order_date < :toTs
                """, all);
        long pending = count("""
                SELECT COUNT(*) FROM orders o
                WHERE o.status = 'PENDING'
                  AND o.order_date >= :fromTs AND o.order_date < :toTs
                """, all);

        BigDecimal average = revenueOrders == 0
                ? BigDecimal.ZERO
                : totalRevenue.divide(BigDecimal.valueOf(revenueOrders), 2, RoundingMode.HALF_UP);
        double cancellationRate = allOrders == 0 ? 0 : (cancelledOrders * 100.0) / allOrders;

        long totalCustomers = count("SELECT COUNT(*) FROM users WHERE role = 'BUYER'", new MapSqlParameterSource());
        long customersWhoOrdered = count("""
                SELECT COUNT(DISTINCT o.user_id) FROM orders o
                WHERE o.status <> 'CANCELLED'
                  AND o.order_date >= :fromTs AND o.order_date < :toTs
                """, all);
        long newCustomers = count("""
                SELECT COUNT(*) FROM users
                WHERE role = 'BUYER'
                  AND created_at >= :fromTs AND created_at < :toTs
                """, all);
        long returning = count("""
                SELECT COUNT(DISTINCT o.user_id) FROM orders o
                WHERE o.status <> 'CANCELLED'
                  AND o.order_date >= :fromTs AND o.order_date < :toTs
                  AND EXISTS (
                    SELECT 1 FROM orders prev
                    WHERE prev.user_id = o.user_id
                      AND prev.order_date < :fromTs
                      AND prev.status <> 'CANCELLED'
                  )
                """, all);

        return AnalyticsResponse.builder()
                .range(window.key())
                .rangeLabel(window.label())
                .from(window.from())
                .to(window.toInclusive())
                .totalRevenue(totalRevenue)
                .totalOrders(revenueOrders)
                .unitsSold(unitsSold)
                .averageOrderValue(average)
                .cancelledOrders(cancelledOrders)
                .cancelledRevenue(cancelledRevenue)
                .cancellationRate(Math.round(cancellationRate * 10.0) / 10.0)
                .deliveredOrders(delivered)
                .pendingOrders(pending)
                .totalCustomers(totalCustomers)
                .customersWhoOrdered(customersWhoOrdered)
                .newCustomers(newCustomers)
                .returningCustomers(returning)
                .lowStockThreshold(threshold)
                .salesOverTime(salesOverTime(revenue, window))
                .topProducts(productStats(revenue, "DESC", true))
                .lowPerformingProducts(lowPerformers(revenue))
                .frequentlyCancelledProducts(cancelledProducts(all))
                .lowStock(stock("stock > 0 AND stock <= :threshold", threshold))
                .outOfStock(stock("stock <= 0", threshold))
                .revenueByCategory(categories(revenue))
                .statusDistribution(statuses(all))
                .topCustomers(customers(revenue))
                .build();
    }

    private List<AnalyticsResponse.SalesPoint> salesOverTime(MapSqlParameterSource params, Window window) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT CAST(o.order_date AS date) AS day,
                       COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS revenue,
                       COUNT(DISTINCT o.id) AS orders
                FROM orders o
                JOIN order_items oi ON oi.order_id = o.id
                WHERE o.status IN (:statuses)
                  AND o.order_date >= :fromTs AND o.order_date < :toTs
                GROUP BY CAST(o.order_date AS date)
                ORDER BY day
                """, params);

        long days = ChronoUnit.DAYS.between(window.from(), window.toInclusive()) + 1;
        DateTimeFormatter daily = DateTimeFormatter.ofPattern("MMM d");
        if (days > 120) {
            return rollup(rows, date -> date.withDayOfMonth(1).format(DateTimeFormatter.ofPattern("MMM yyyy")));
        }
        if (days > 45) {
            return rollup(rows, date -> "Week of " + date.minusDays(date.getDayOfWeek().getValue() - 1L).format(daily));
        }
        return rollup(rows, daily::format);
    }

    private List<AnalyticsResponse.SalesPoint> rollup(List<Map<String, Object>> rows,
                                                      java.util.function.Function<LocalDate, String> labeler) {
        Map<String, AnalyticsResponse.SalesPoint> buckets = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            LocalDate day = toDate(row.get("day"));
            if (day == null) continue;
            String label = labeler.apply(day);
            AnalyticsResponse.SalesPoint existing = buckets.get(label);
            if (existing == null) {
                buckets.put(label, AnalyticsResponse.SalesPoint.builder()
                        .label(label)
                        .revenue(money(row.get("revenue")))
                        .orders(asLong(row.get("orders")))
                        .build());
            } else {
                existing.setRevenue(existing.getRevenue().add(money(row.get("revenue"))));
                existing.setOrders(existing.getOrders() + asLong(row.get("orders")));
            }
        }
        return new ArrayList<>(buckets.values());
    }

    private List<AnalyticsResponse.ProductStat> productStats(MapSqlParameterSource params, String direction, boolean withOrders) {
        return jdbc.query("""
                SELECT oi.product_name AS name,
                       COALESCE(SUM(oi.quantity), 0) AS units,
                       COUNT(DISTINCT oi.order_id) AS orders,
                       COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS revenue,
                       MAX(o.order_date) AS last_sale
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                WHERE o.status IN (:statuses)
                  AND o.order_date >= :fromTs AND o.order_date < :toTs
                GROUP BY oi.product_name
                ORDER BY units %s
                LIMIT 8
                """.formatted(direction), params, (rs, n) -> AnalyticsResponse.ProductStat.builder()
                .name(rs.getString("name"))
                .unitsSold(rs.getLong("units"))
                .orderCount(withOrders ? rs.getLong("orders") : 0)
                .revenue(rs.getBigDecimal("revenue"))
                .lastSaleDate(rs.getTimestamp("last_sale") == null ? null
                        : rs.getTimestamp("last_sale").toLocalDateTime().toLocalDate().toString())
                .build());
    }

    private List<AnalyticsResponse.ProductStat> lowPerformers(MapSqlParameterSource params) {
        return jdbc.query("""
                SELECT p.name AS name,
                       COALESCE(SUM(CASE WHEN o.id IS NOT NULL THEN oi.quantity ELSE 0 END), 0) AS units,
                       COALESCE(SUM(CASE WHEN o.id IS NOT NULL THEN oi.unit_price * oi.quantity ELSE 0 END), 0) AS revenue,
                       MAX(o.order_date) AS last_sale
                FROM products p
                LEFT JOIN order_items oi ON oi.product_id = p.id
                LEFT JOIN orders o ON o.id = oi.order_id
                    AND o.status IN (:statuses)
                    AND o.order_date >= :fromTs AND o.order_date < :toTs
                GROUP BY p.id, p.name
                ORDER BY units ASC, p.name ASC
                LIMIT 8
                """, params, (rs, n) -> AnalyticsResponse.ProductStat.builder()
                .name(rs.getString("name"))
                .unitsSold(rs.getLong("units"))
                .revenue(rs.getBigDecimal("revenue"))
                .lastSaleDate(rs.getTimestamp("last_sale") == null ? null
                        : rs.getTimestamp("last_sale").toLocalDateTime().toLocalDate().toString())
                .build());
    }

    private List<AnalyticsResponse.ProductStat> cancelledProducts(MapSqlParameterSource params) {
        return jdbc.query("""
                SELECT oi.product_name AS name,
                       COALESCE(SUM(oi.quantity), 0) AS units,
                       COUNT(DISTINCT oi.order_id) AS orders,
                       COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS revenue
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                WHERE o.status = 'CANCELLED'
                  AND o.order_date >= :fromTs AND o.order_date < :toTs
                GROUP BY oi.product_name
                ORDER BY units DESC
                LIMIT 5
                """, params, (rs, n) -> AnalyticsResponse.ProductStat.builder()
                .name(rs.getString("name"))
                .unitsSold(rs.getLong("units"))
                .orderCount(rs.getLong("orders"))
                .revenue(rs.getBigDecimal("revenue"))
                .build());
    }

    private List<AnalyticsResponse.StockAlert> stock(String where, int threshold) {
        return jdbc.query("""
                SELECT id, name, stock FROM products
                WHERE %s
                ORDER BY stock ASC, name ASC
                LIMIT 20
                """.formatted(where),
                new MapSqlParameterSource("threshold", threshold),
                (rs, n) -> AnalyticsResponse.StockAlert.builder()
                        .id(rs.getLong("id"))
                        .name(rs.getString("name"))
                        .stock(rs.getInt("stock"))
                        .build());
    }

    private List<AnalyticsResponse.CategoryStat> categories(MapSqlParameterSource params) {
        return jdbc.query("""
                SELECT COALESCE(c.name, 'Uncategorized') AS category,
                       COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS revenue
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                LEFT JOIN products p ON p.id = oi.product_id
                LEFT JOIN categories c ON c.id = p.category_id
                WHERE o.status IN (:statuses)
                  AND o.order_date >= :fromTs AND o.order_date < :toTs
                GROUP BY COALESCE(c.name, 'Uncategorized')
                ORDER BY revenue DESC
                """, params, (rs, n) -> AnalyticsResponse.CategoryStat.builder()
                .category(rs.getString("category"))
                .revenue(rs.getBigDecimal("revenue"))
                .build());
    }

    private List<AnalyticsResponse.StatusStat> statuses(MapSqlParameterSource params) {
        return jdbc.query("""
                SELECT status, COUNT(*) AS total
                FROM orders
                WHERE order_date >= :fromTs AND order_date < :toTs
                GROUP BY status
                ORDER BY total DESC
                """, params, (rs, n) -> AnalyticsResponse.StatusStat.builder()
                .status(rs.getString("status"))
                .count(rs.getLong("total"))
                .build());
    }

    private List<AnalyticsResponse.CustomerStat> customers(MapSqlParameterSource params) {
        return jdbc.query("""
                SELECT o.customer_name AS name,
                       COUNT(DISTINCT o.id) AS orders,
                       COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS spending
                FROM orders o
                JOIN order_items oi ON oi.order_id = o.id
                WHERE o.status IN (:statuses)
                  AND o.order_date >= :fromTs AND o.order_date < :toTs
                GROUP BY o.user_id, o.customer_name
                ORDER BY spending DESC
                LIMIT 5
                """, params, (rs, n) -> AnalyticsResponse.CustomerStat.builder()
                .name(rs.getString("name"))
                .orders(rs.getLong("orders"))
                .spending(rs.getBigDecimal("spending"))
                .build());
    }

    private MapSqlParameterSource params(Window window) {
        return new MapSqlParameterSource()
                .addValue("fromTs", Timestamp.valueOf(window.from().atStartOfDay()))
                .addValue("toTs", Timestamp.valueOf(window.toInclusive().plusDays(1).atStartOfDay()));
    }

    private long count(String sql, MapSqlParameterSource params) {
        Number value = jdbc.queryForObject(sql, params, Number.class);
        return value == null ? 0 : value.longValue();
    }

    private BigDecimal money(Object value) {
        if (value == null) return BigDecimal.ZERO;
        if (value instanceof BigDecimal decimal) return decimal;
        if (value instanceof Number number) return BigDecimal.valueOf(number.doubleValue());
        return new BigDecimal(value.toString());
    }

    private long asLong(Object value) {
        if (value == null) return 0;
        if (value instanceof Number number) return number.longValue();
        return Long.parseLong(value.toString());
    }

    private LocalDate toDate(Object value) {
        if (value instanceof Date date) return date.toLocalDate();
        if (value instanceof Timestamp timestamp) return timestamp.toLocalDateTime().toLocalDate();
        if (value instanceof LocalDate localDate) return localDate;
        return null;
    }

    private Window resolve(String range, LocalDate customFrom, LocalDate customTo) {
        LocalDate today = LocalDate.now();
        String key = range == null ? "last30" : range;
        return switch (key) {
            case "today" -> new Window(key, "Today", today, today);
            case "yesterday" -> new Window(key, "Yesterday", today.minusDays(1), today.minusDays(1));
            case "last7" -> new Window(key, "Last 7 Days", today.minusDays(6), today);
            case "this_month" -> new Window(key, "This Month", today.withDayOfMonth(1), today);
            case "last_month" -> {
                LocalDate first = today.withDayOfMonth(1);
                yield new Window(key, "Last Month", first.minusMonths(1), first.minusDays(1));
            }
            case "this_year" -> new Window(key, "This Year", today.withDayOfYear(1), today);
            case "all" -> new Window(key, "All Time", LocalDate.of(2000, 1, 1), today);
            case "custom" -> {
                LocalDate from = customFrom != null ? customFrom : today.minusDays(29);
                LocalDate to = customTo != null ? customTo : today;
                if (to.isBefore(from)) {
                    LocalDate swap = from;
                    from = to;
                    to = swap;
                }
                yield new Window(key, "Custom Range", from, to);
            }
            default -> new Window("last30", "Last 30 Days", today.minusDays(29), today);
        };
    }

    private record Window(String key, String label, LocalDate from, LocalDate toInclusive) {}
}
