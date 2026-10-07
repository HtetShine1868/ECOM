package com.ecomerce.dto;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Data
@Builder
public class AnalyticsResponse {
    private String range;
    private String rangeLabel;
    private LocalDate from;
    private LocalDate to;
    private BigDecimal totalRevenue;
    private long totalOrders;
    /** Every order placed in the period, including ones still waiting for confirmation. */
    private long ordersPlaced;
    private long unitsSold;
    private BigDecimal averageOrderValue;
    private long cancelledOrders;
    private BigDecimal cancelledRevenue;
    private double cancellationRate;
    private long deliveredOrders;
    private long pendingOrders;
    private long totalCustomers;
    private long customersWhoOrdered;
    private long newCustomers;
    private long returningCustomers;
    private int lowStockThreshold;
    private List<SalesPoint> salesOverTime;
    private List<ProductStat> topProducts;
    private List<ProductStat> lowPerformingProducts;
    private List<ProductStat> frequentlyCancelledProducts;
    private List<StockAlert> lowStock;
    private List<StockAlert> outOfStock;
    private List<CategoryStat> revenueByCategory;
    private List<StatusStat> statusDistribution;
    private List<CustomerStat> topCustomers;

    @Data
    @Builder
    public static class SalesPoint {
        private String label;
        private BigDecimal revenue;
        private long orders;
    }

    @Data
    @Builder
    public static class ProductStat {
        private String name;
        private long unitsSold;
        private long orderCount;
        private BigDecimal revenue;
        private String lastSaleDate;
    }

    @Data
    @Builder
    public static class StockAlert {
        private Long id;
        private String name;
        private int stock;
    }

    @Data
    @Builder
    public static class CategoryStat {
        private String category;
        private BigDecimal revenue;
    }

    @Data
    @Builder
    public static class StatusStat {
        private String status;
        private long count;
    }

    @Data
    @Builder
    public static class CustomerStat {
        private String name;
        private long orders;
        private BigDecimal spending;
    }
}
