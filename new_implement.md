# Complete Implementation Flow: E-commerce Account Security, Ratings & Recommendations

## 1. Existing Project Architecture

Use the existing technologies and project structure.

| Component | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | Java 21 + Spring Boot 3.3.5 |
| Database | Supabase PostgreSQL |
| Authentication | Spring Security + JWT |
| Social Login | Google OAuth + Facebook OAuth |
| Image Storage | Supabase Storage |
| Cache | Redis |
| Deployment | Vercel + Render |

Preserve the existing modular monolith architecture. Reuse existing users, products, orders, order items, cart, authentication, and frontend components.

---

# PART 1: ACCOUNT REGISTRATION & EMAIL VERIFICATION

## Phase 1: Database and Account Management

### 1.1 Update Existing User Table

Add the following fields where they do not already exist:

- `email_verified`
- `email_verified_at`
- `account_status` (ACTIVE, PENDING_EMAIL, SUSPENDED)
- `email_verification_sent_at`

Preserve existing user roles and authentication relationships.

### 1.2 Create Email Verification Token Table

Create `email_verification_tokens`:

- id
- user_id
- token_hash
- expires_at
- used_at
- created_at

Rules:

- Generate cryptographically secure random tokens.
- Store token hashes, never raw tokens.
- Token expires after 24 hours.
- Each token can only be used once.
- Invalidate previous unused tokens when a new one is generated.

## Phase 2: Email Registration Flow

### 2.1 Registration

When a customer registers with email and password:

1. Validate registration information.
2. Check for an existing account.
3. Hash the password.
4. Create the account with `email_verified = false`.
5. Set `account_status = PENDING_EMAIL`.
6. Generate a verification token.
7. Send a verification email.
8. Redirect the customer to `/verify-email`.

Do not grant normal shopping authorization before verification.

### 2.2 Verification Page

Create a dedicated `/verify-email` page.

Display:

- Email address.
- Verification instructions.
- Resend Verification Email button.
- Message explaining that the link expires after 24 hours.

Example:

"Check your email to verify your account. Click the verification link we sent you to activate your account."

### 2.3 Email Verification

Verification workflow:

1. Customer opens the email.
2. Customer clicks the verification link.
3. Frontend extracts the token.
4. Frontend calls `POST /api/auth/verify-email`.
5. Backend validates the token and expiration.
6. Backend marks the account as verified.
7. Backend changes account status to ACTIVE.
8. Frontend displays successful verification.
9. Redirect the customer to the shopping homepage.

### 2.4 Resend Verification

Implement:

`POST /api/auth/resend-verification`

Rules:

- 60-second resend cooldown.
- Invalidate previous unused token.
- Generate a new token.
- Send a new verification email.
- Do not disclose whether an account exists.
- Do not send verification emails to already verified accounts.

## Phase 3: Google and Facebook Login

### 3.1 Google Login

1. Customer selects Google Login.
2. Google authenticates the customer.
3. Backend validates the Google identity.
4. Backend checks Google's `email_verified` claim.
5. If verified, create or retrieve the user.
6. Set email verification status to true.
7. Set account status to ACTIVE, unless suspended.
8. Issue the existing JWT.
9. Redirect to the shopping homepage.

No additional email verification is required for a verified Google email.

### 3.2 Facebook Login

1. Customer selects Facebook Login.
2. Facebook authenticates the customer.
3. Backend validates the Facebook authentication response.
4. If verified, activate the account.
5. Redirect verified customers to the homepage and unverified customers to `/verify-email`.

no need additional verification

### 3.3 Account Linking

- Identify existing social accounts using provider IDs.
- Do not automatically merge accounts based only on matching email addresses.
- Require authentication of the existing account before linking another login method.

## Phase 4: Authentication and Checkout Protection

### 4.1 Account Permissions

| Action | Unverified | Verified |
|---|---|---|
| Browse products | Yes | Yes |
| Search products | Yes | Yes |
| View product details | Yes | Yes |
| Add to cart | Yes | Yes |
| View profile | Yes | Yes |
| Checkout | No | Yes |
| Place order | No | Yes |
| Initiate payment | No | Yes |
| Submit review | No | Yes, if purchase eligible |

Suspended accounts cannot access protected shopping operations.

### 4.2 Backend Enforcement

Create a reusable account verification service.

Example:

`AccountVerificationService.requireVerifiedEmail(userId)`

Use it in:

- Checkout.
- Create order.
- COD order placement.
- Online payment initiation.

The backend must check the current account verification and status from the database.

Never trust frontend verification status or user IDs supplied by the customer.

### 4.3 Frontend Enforcement

- Unverified customers attempting checkout are redirected to `/verify-email` or shown a verification reminder.
- Verified customers proceed normally.
- Display verification status in the customer profile.
- Allow customers to resend verification emails.

---

# PART 2: PRODUCT RATINGS & REVIEWS

## Phase 5: Review Database Implementation

### 5.1 Create reviews Table

Fields:

- id
- user_id
- product_id
- order_item_id
- rating (1–5)
- title (optional)
- comment (optional)
- created_at
- updated_at

Rules:

- One review per customer per product.
- One order item cannot be used for multiple reviews.
- Rating must be between 1 and 5.
- Link reviews to existing users, products, and order items.
- No approval status is required.

### 5.2 Create review_images Table

Fields:

- id
- review_id
- image_url
- storage_path
- created_at

Support multiple review images through the existing Supabase Storage setup.

### 5.3 Create product_rating_summary Table

Fields:

- product_id
- average_rating
- total_reviews
- rating_1_count
- rating_2_count
- rating_3_count
- rating_4_count
- rating_5_count
- updated_at

All existing reviews contribute to product rating statistics.

Update the summary when a review is created, edited, or deleted.

Use concurrency-safe database operations.

## Phase 6: Review Backend Implementation

### 6.1 Review Eligibility

A customer can submit a review only when:

1. The customer is authenticated.
2. The customer's email is verified.
3. The customer has purchased the product.
4. The related order is DELIVERED or has the equivalent existing completed status.
5. The customer has not already reviewed that product.

Verify purchase eligibility using actual database records.

Never trust frontend-provided purchase verification.

### 6.2 Review APIs

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/products/{id}/reviews` | Submit review |
| GET | `/api/products/{id}/reviews` | Get product reviews |
| GET | `/api/products/{id}/rating-summary` | Get rating statistics |
| PUT | `/api/reviews/{id}` | Edit own review |
| DELETE | `/api/reviews/{id}` | Delete own review |
| GET | `/api/users/me/reviews` | Get customer's reviews |

Requirements:

- Pagination.
- Sorting by newest, oldest, highest rating, and lowest rating.
- Reviewer information according to existing privacy conventions.
- Verified purchase badge based on backend purchase records.
- Ownership validation for editing and deleting.

### 6.3 Review Business Rules

1. New reviews become publicly visible immediately.
2. All reviews contribute to product rating statistics immediately.
3. Customers can edit their own reviews.
4. Customers can delete their own reviews.
5. Edited reviews remain publicly visible immediately.
6. Customers cannot modify other customers' reviews.
7. Customers cannot review products they have not successfully purchased and received.

There is no review approval system and no admin review moderation requirement.

## Phase 7: Review Frontend Implementation

### 7.1 Product Cards

Display:

- Average star rating.
- Average rating value.
- Total review count.

### 7.2 Product Detail Page

Add:

- Average rating.
- Total reviews.
- Five-star rating distribution.
- Review list.
- Reviewer information.
- Verified purchase badge.
- Review images.
- Sorting.
- Pagination.
- Write Review button.

### 7.3 Review Submission Form

Provide:

- Interactive 1–5 star selector.
- Optional review title.
- Optional comment.
- Optional multiple image uploads.
- Submit button.

After successful submission, immediately display the new review.

### 7.4 Customer Review Management

Allow customers to:

- View their reviews.
- Edit their reviews.
- Delete their reviews.

Reuse the existing account and profile interface where appropriate.

---

# PART 3: PERSONALIZED PRODUCT RECOMMENDATIONS

## Phase 8: Customer Activity Tracking

### 8.1 Create user_product_events Table

Fields:

- id
- user_id (nullable for anonymous sessions)
- product_id
- event_type
- event_weight
- session_id (optional)
- created_at

Supported events:

| Event | Initial Weight |
|---|---:|
| VIEW | 1 |
| SEARCH_CLICK | 3 |
| ADD_TO_CART | 5 |
| PURCHASE | 10 |

Calculate event weights in the backend.

### 8.2 Track Customer Activities

**Product Views**
- Record when customers open product detail pages.
- Associate with authenticated users or anonymous sessions.
- Prevent excessive duplicate views within a configurable time window.

**Search Clicks**
- Record when customers open products from search results.

**Add to Cart**
- Record an event after a successful cart operation.

**Purchases**
- Record events from the existing successful order/payment workflow.
- Use existing order and order-item records.
- Prevent duplicate purchase events.
- Do not record a purchase when a customer only adds a product to the cart.

Use the existing backend workflow. Do not introduce RabbitMQ or Transactional Outbox.

## Phase 9: Customer Interest Calculation

Calculate customer interests from:

- Product views.
- Search clicks.
- Cart activity.
- Purchase history.

Use time decay:

`effectiveWeight = eventWeight * exp(-lambda * ageInDays)`

Recent activities should have greater influence.

Aggregate interests using existing product information:

- Products.
- Categories.
- Brands, if available.

Generate customer interest profiles dynamically.

Do not permanently assign customers to a single category.

## Phase 10: Recommendation Engine

Implement the recommendation engine in Java.

### 10.1 Content-Based Recommendations

Compare customer interests with:

- Category.
- Subcategory.
- Brand.
- Tags.
- Attributes.
- Price range.

Recommend products with similar characteristics.

### 10.2 Behavior-Based Recommendations

Use:

- Purchased products.
- Products added to cart.
- Frequently viewed products.
- Search clicks.

Apply time decay.

### 10.3 Popularity-Based Recommendations

Calculate popularity using:

- Purchase count.
- Units sold.
- Add-to-cart activity.
- Recent views.
- Average product ratings.

Give purchases greater influence than views.

### 10.4 Frequently Bought Together

Create `product_co_occurrences`.

Fields:

- product_a_id
- product_b_id
- co_purchase_count
- updated_at

Requirements:

- Use a composite key.
- Calculate relationships from completed purchases.
- Count each product pair at most once per order, regardless of quantity.
- Canonicalize product pair ordering.

### 10.5 Hybrid Scoring

Use the following initial formula:

```text
finalScore =
    (contentScore * 0.40) +
    (behaviorScore * 0.30) +
    (popularityScore * 0.20) +
    (ratingScore * 0.10)
```

Normalize all component scores to 0–100.

Make scoring weights configurable.

### 10.6 Recommendation Rules

- Exclude unpublished products.
- Exclude inactive products.
- Exclude deleted products.
- Exclude out-of-stock products from purchase recommendations.
- Exclude the current product from related products.
- Remove duplicates.
- Balance category and brand diversity.
- Prioritize relevance.
- Use deterministic tie-breaking.

### 10.7 New Customer Fallback

When a customer has insufficient activity:

- Display popular products.
- Do not fabricate personalized results.

For anonymous customers, use popular products and optionally recently viewed session activity.

---

# PART 4: RECOMMENDATION APIs AND FRONTEND

## Phase 11: Recommendation Backend APIs

Implement:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/recommendations/for-you` | Personalized recommendations |
| GET | `/api/recommendations/related/{productId}` | Related products |
| GET | `/api/recommendations/popular` | Popular products |
| GET | `/api/recommendations/frequently-bought/{productId}` | Frequently bought together |
| GET | `/api/recommendations/recently-viewed` | Recently viewed products |

Requirements:

- Identify authenticated users through Spring Security.
- Do not allow customers to retrieve another customer's recommendations.
- Support configurable result limits.
- Return actual product information from the existing product service.
- Include recommendation type and a short recommendation reason.
- Use popular products as fallback.

## Phase 12: Redis Caching

Use Redis for recommendation results and rating summaries.

### Cache Keys

```text
recommendations:user:{userId}
recommendations:related:{productId}
recommendations:popular
recommendations:frequently-bought:{productId}
product:rating:{productId}
```

### Initial TTL

| Cache | TTL |
|---|---|
| Personalized recommendations | 15 minutes |
| Related products | 30 minutes |
| Popular products | 10 minutes |
| Frequently bought together | 30 minutes |
| Rating summary | 10 minutes |

### Cache Invalidation

Invalidate relevant caches when:

- Customer activity changes significantly.
- A purchase completes.
- A review is created, edited, or deleted.
- Product information changes.
- Product availability changes.

Redis is only a cache. PostgreSQL remains the source of truth.

Always retrieve current product prices and stock from the existing backend.

## Phase 13: Recommendation Frontend

### 13.1 Homepage

For authenticated customers, display:

1. Recommended for You.
2. Recently Viewed.
3. Popular Products.

For customers with insufficient activity, use popular products.

For anonymous visitors, display popular products.

### 13.2 Product Detail Page

Add:

- Related Products.
- Frequently Bought Together.

### 13.3 Cart Page

Add:

- You May Also Like.

Base recommendations on cart contents, product co-purchase relationships, and customer interests.

Never automatically add recommended products to the cart.

### 13.4 Product Cards

Reuse the existing product card component.

Display:

- Product image.
- Product name.
- Current price.
- Average rating.
- Availability.
- Product navigation.

Implement loading and empty states.

---

# PART 5: CONFIGURATION AND INTEGRATION

## Phase 14: Configuration

Make the following values configurable:

**Email Verification**
- Token expiration.
- Resend cooldown.
- SMTP configuration.
- Frontend verification URL.

**Activity Tracking**
- Event weights.
- Duplicate event time window.
- Time-decay rate.

**Recommendation Engine**
- Hybrid scoring weights.
- Minimum activity threshold.
- Recommendation result limits.
- Co-purchase calculation parameters.

**Redis**
- Cache TTL values.

Reuse existing configuration conventions and avoid duplicate environment variables.

## Phase 15: Final Integration

Ensure all three features work together.

### Account Integration

- Only verified accounts can checkout.
- Only verified customers can submit reviews.
- Google verified accounts can access shopping immediately.
- Facebook accounts require email verification if ownership is not established.

### Review Integration

- Product cards display current average ratings.
- Product detail pages display reviews.
- Recommendation scores use approved? No: all existing reviews contribute to ratings.
- Rating summaries update immediately after review changes.

### Recommendation Integration

- Product views generate activity events.
- Cart additions generate activity events.
- Completed purchases generate purchase events.
- Recommendation engine uses this information.
- Product availability and current prices always come from PostgreSQL/backend.

---

# Final Technical Constraints

- Preserve the existing modular monolith.
- Reuse existing entities, repositories, services, and frontend components.
- Use database migrations.
- Use proper transaction boundaries.
- Keep backend validation authoritative.
- Use Java for recommendation calculations.
- Use Redis only for caching.
- Do not introduce RabbitMQ.
- Do not introduce Transactional Outbox.
- Do not introduce microservices.
- Do not require Gemini, Claude, or other external AI APIs.
- Do not introduce CAPTCHA.
- Do not introduce phone OTP.
- Do not introduce review approval or admin review moderation.
- Do not introduce inventory reservation.
- Do not introduce admin audit history.
- Do not break existing cart, checkout, payment, order, or inventory behavior.
- Do not create duplicate user or product entities.

## Implementation Order

1. Account database changes.
2. Email verification system.
3. Email registration and verification frontend.
4. Google and Facebook login integration.
5. JWT and checkout protection.
6. Review database and backend.
7. Review frontend.
8. Customer activity tracking.
9. Recommendation engine.
10. Recommendation APIs.
11. Redis caching.
12. Recommendation frontend.
13. Configuration and final integration.

The final system should provide secure account registration, immediate customer reviews and ratings, and personalized product recommendations while preserving the existing e-commerce application architecture.