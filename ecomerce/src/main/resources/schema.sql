CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    recipient_id BIGINT NOT NULL REFERENCES users (id),
    notification_type VARCHAR(40) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message VARCHAR(500) NOT NULL,
    order_id BIGINT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
    ON notifications (recipient_id, created_at DESC);;

-- ─── Phase 1: Product enhancements ───────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;;
ALTER TABLE products ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;;

-- Price and stock non-negativity constraints (safe to run multiple times)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_price_non_negative'
    ) THEN
        ALTER TABLE products ADD CONSTRAINT chk_price_non_negative CHECK (price >= 0);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_stock_non_negative'
    ) THEN
        ALTER TABLE products ADD CONSTRAINT chk_stock_non_negative CHECK (stock >= 0);
    END IF;
END $$;;

-- ─── Part 1: Account Security & Email Verification ───────────────────────────

-- Add email verification fields to users (safe to re-run)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE;;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_sent_at TIMESTAMP WITH TIME ZONE;;

-- Email verification tokens table
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);;

CREATE INDEX IF NOT EXISTS idx_email_tokens_user_id
    ON email_verification_tokens (user_id);;

CREATE INDEX IF NOT EXISTS idx_email_tokens_hash
    ON email_verification_tokens (token_hash);;

-- ─── Part 2: Product Reviews & Ratings ───────────────────────────────────────

-- Reviews table
CREATE TABLE IF NOT EXISTS reviews (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    order_item_id BIGINT REFERENCES order_items (id) ON DELETE SET NULL,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title VARCHAR(200),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_review_user_product UNIQUE (user_id, product_id)
);;

CREATE INDEX IF NOT EXISTS idx_reviews_product_id
    ON reviews (product_id, created_at DESC);;

CREATE INDEX IF NOT EXISTS idx_reviews_user_id
    ON reviews (user_id);;

-- Review images
CREATE TABLE IF NOT EXISTS review_images (
    id BIGSERIAL PRIMARY KEY,
    review_id BIGINT NOT NULL REFERENCES reviews (id) ON DELETE CASCADE,
    image_url VARCHAR(500) NOT NULL,
    storage_path VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);;

CREATE INDEX IF NOT EXISTS idx_review_images_review_id
    ON review_images (review_id);;

-- Product rating summary (one row per product, upserted on review changes)
CREATE TABLE IF NOT EXISTS product_rating_summary (
    product_id BIGINT PRIMARY KEY REFERENCES products (id) ON DELETE CASCADE,
    average_rating NUMERIC(3,2) NOT NULL DEFAULT 0,
    total_reviews INT NOT NULL DEFAULT 0,
    rating_1_count INT NOT NULL DEFAULT 0,
    rating_2_count INT NOT NULL DEFAULT 0,
    rating_3_count INT NOT NULL DEFAULT 0,
    rating_4_count INT NOT NULL DEFAULT 0,
    rating_5_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);;

-- ─── Part 3: Recommendation Engine ───────────────────────────────────────────

-- User product interaction events
CREATE TABLE IF NOT EXISTS user_product_events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users (id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    event_type VARCHAR(30) NOT NULL,
    event_weight INT NOT NULL,
    session_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);;

CREATE INDEX IF NOT EXISTS idx_user_product_events_user
    ON user_product_events (user_id, created_at DESC);;

CREATE INDEX IF NOT EXISTS idx_user_product_events_product
    ON user_product_events (product_id, event_type);;

-- Product co-occurrence (frequently bought together)
CREATE TABLE IF NOT EXISTS product_co_occurrences (
    product_a_id BIGINT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    product_b_id BIGINT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    co_purchase_count INT NOT NULL DEFAULT 1,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (product_a_id, product_b_id),
    CONSTRAINT chk_co_occurrence_canonical CHECK (product_a_id < product_b_id)
);;

CREATE INDEX IF NOT EXISTS idx_co_occurrences_product_a
    ON product_co_occurrences (product_a_id, co_purchase_count DESC);;

CREATE INDEX IF NOT EXISTS idx_co_occurrences_product_b
    ON product_co_occurrences (product_b_id, co_purchase_count DESC);;

-- ─── Phase 2: Enhanced idempotency ───────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_status VARCHAR(20);;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS request_hash VARCHAR(64);;

CREATE TABLE IF NOT EXISTS idempotency_records (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id),
    idempotency_key VARCHAR(120) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    status VARCHAR(30) NOT NULL,
    order_id BIGINT,
    response_payload TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_idempotency_key UNIQUE (user_id, idempotency_key)
);;

CREATE INDEX IF NOT EXISTS idx_idempotency_records_user_key
    ON idempotency_records (user_id, idempotency_key);;

-- ─── Phase 7: Transactional outbox ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id VARCHAR(50) NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    event_version INT NOT NULL DEFAULT 1,
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP WITH TIME ZONE,
    attempt_count INT NOT NULL DEFAULT 0,
    last_error TEXT
);;

CREATE INDEX IF NOT EXISTS idx_outbox_unpublished
    ON outbox_events (created_at) WHERE published_at IS NULL;;

-- ─── Phase 7: Consumer deduplication ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS processed_messages (
    event_id UUID PRIMARY KEY,
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);;

-- ─── Phase 8: Audit log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    changed_by_user_id BIGINT,
    changed_by_email VARCHAR(255),
    old_values JSONB,
    new_values JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);;

CREATE INDEX IF NOT EXISTS idx_audit_entity
    ON audit_log (entity_type, entity_id, created_at DESC);;

-- ─── Advanced features, part 2 (additive, safe to re-run) ─────────────────────

-- Order line subtotal snapshot (nullable: rows created before this column existed
-- are computed as unit_price × quantity when read).
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS line_total NUMERIC(15, 2);;

-- Outbox retry scheduling (exponential backoff).
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMP WITH TIME ZONE;;

CREATE INDEX IF NOT EXISTS idx_outbox_due
    ON outbox_events (next_attempt_at, created_at) WHERE published_at IS NULL;;

-- Price the customer last reviewed for a PostgreSQL-stored cart line (display only).
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS seen_unit_price NUMERIC(15, 2);;

-- Uniqueness guards. Each index is created only when existing data already satisfies it,
-- so this script never fails on (or deletes) existing production rows. If duplicates exist
-- a NOTICE is logged and the index is skipped; clean the data and restart to add it.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_orders_idempotency_key') THEN
        IF NOT EXISTS (
            SELECT idempotency_key FROM orders WHERE idempotency_key IS NOT NULL
            GROUP BY idempotency_key HAVING COUNT(*) > 1
        ) THEN
            CREATE UNIQUE INDEX uq_orders_idempotency_key ON orders (idempotency_key)
                WHERE idempotency_key IS NOT NULL;
        ELSE
            RAISE NOTICE 'Skipped uq_orders_idempotency_key: duplicate idempotency keys exist';
        END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_carts_user') THEN
        IF NOT EXISTS (SELECT user_id FROM carts GROUP BY user_id HAVING COUNT(*) > 1) THEN
            CREATE UNIQUE INDEX uq_carts_user ON carts (user_id);
        ELSE
            RAISE NOTICE 'Skipped uq_carts_user: a user has more than one cart row';
        END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_cart_items_cart_product') THEN
        IF NOT EXISTS (
            SELECT cart_id, product_id FROM cart_items GROUP BY cart_id, product_id HAVING COUNT(*) > 1
        ) THEN
            CREATE UNIQUE INDEX uq_cart_items_cart_product ON cart_items (cart_id, product_id);
        ELSE
            RAISE NOTICE 'Skipped uq_cart_items_cart_product: duplicate cart lines exist';
        END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_cargo_price_non_negative') THEN
        IF NOT EXISTS (SELECT 1 FROM products WHERE cargo_price < 0) THEN
            ALTER TABLE products ADD CONSTRAINT chk_cargo_price_non_negative
                CHECK (cargo_price IS NULL OR cargo_price >= 0);
        END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_item_quantity_positive') THEN
        IF NOT EXISTS (SELECT 1 FROM order_items WHERE quantity <= 0) THEN
            ALTER TABLE order_items ADD CONSTRAINT chk_order_item_quantity_positive CHECK (quantity > 0);
        END IF;
    END IF;
END $$;;

-- ─── Part 1: Account Security & Email Verification ───────────────────────────

-- Add email verification fields to users (safe to re-run)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE;;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_sent_at TIMESTAMP WITH TIME ZONE;;

-- Email verification tokens table
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);;

CREATE INDEX IF NOT EXISTS idx_email_tokens_user_id
    ON email_verification_tokens (user_id);;

CREATE INDEX IF NOT EXISTS idx_email_tokens_hash
    ON email_verification_tokens (token_hash);;

-- ─── Part 2: Product Reviews & Ratings ───────────────────────────────────────

-- Reviews table
CREATE TABLE IF NOT EXISTS reviews (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    order_item_id BIGINT REFERENCES order_items (id) ON DELETE SET NULL,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title VARCHAR(200),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_review_user_product UNIQUE (user_id, product_id)
);;

CREATE INDEX IF NOT EXISTS idx_reviews_product_id
    ON reviews (product_id, created_at DESC);;

CREATE INDEX IF NOT EXISTS idx_reviews_user_id
    ON reviews (user_id);;

-- Review images
CREATE TABLE IF NOT EXISTS review_images (
    id BIGSERIAL PRIMARY KEY,
    review_id BIGINT NOT NULL REFERENCES reviews (id) ON DELETE CASCADE,
    image_url VARCHAR(500) NOT NULL,
    storage_path VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);;

CREATE INDEX IF NOT EXISTS idx_review_images_review_id
    ON review_images (review_id);;

-- Product rating summary (one row per product, upserted on review changes)
CREATE TABLE IF NOT EXISTS product_rating_summary (
    product_id BIGINT PRIMARY KEY REFERENCES products (id) ON DELETE CASCADE,
    average_rating NUMERIC(3,2) NOT NULL DEFAULT 0,
    total_reviews INT NOT NULL DEFAULT 0,
    rating_1_count INT NOT NULL DEFAULT 0,
    rating_2_count INT NOT NULL DEFAULT 0,
    rating_3_count INT NOT NULL DEFAULT 0,
    rating_4_count INT NOT NULL DEFAULT 0,
    rating_5_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);;

-- ─── Part 3: Recommendation Engine ───────────────────────────────────────────

-- User product interaction events
CREATE TABLE IF NOT EXISTS user_product_events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users (id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    event_type VARCHAR(30) NOT NULL,
    event_weight INT NOT NULL,
    session_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);;

CREATE INDEX IF NOT EXISTS idx_user_product_events_user
    ON user_product_events (user_id, created_at DESC);;

CREATE INDEX IF NOT EXISTS idx_user_product_events_product
    ON user_product_events (product_id, event_type);;

-- Product co-occurrence (frequently bought together)
CREATE TABLE IF NOT EXISTS product_co_occurrences (
    product_a_id BIGINT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    product_b_id BIGINT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    co_purchase_count INT NOT NULL DEFAULT 1,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (product_a_id, product_b_id),
    CONSTRAINT chk_co_occurrence_canonical CHECK (product_a_id < product_b_id)
);;

CREATE INDEX IF NOT EXISTS idx_co_occurrences_product_a
    ON product_co_occurrences (product_a_id, co_purchase_count DESC);;

CREATE INDEX IF NOT EXISTS idx_co_occurrences_product_b
    ON product_co_occurrences (product_b_id, co_purchase_count DESC);;
