-- RentMe Hyderabad Marketplace - PostgreSQL Production Schema
-- Tables: users, profiles, companions, experiences, availability, bookings,
--         booking_events, reviews, reports, payments, payouts, notifications, audit_logs

-- Enable UUID extension if available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(32) NOT NULL CHECK (role IN ('customer', 'companion', 'admin')),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(64),
  password_hash VARCHAR(255),
  auth_id VARCHAR(64) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(255) NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  city VARCHAR(255) NOT NULL DEFAULT 'Hyderabad, Telangana',
  id_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_status VARCHAR(64) NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Companions
CREATE TABLE IF NOT EXISTS companions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  city VARCHAR(255) NOT NULL DEFAULT 'Hyderabad, Telangana',
  category VARCHAR(64) NOT NULL,
  rate NUMERIC(10, 2) NOT NULL,
  rating NUMERIC(3, 2) NOT NULL DEFAULT 5.0,
  reviews INT NOT NULL DEFAULT 0,
  response VARCHAR(64) NOT NULL DEFAULT '15 min',
  status VARCHAR(64) NOT NULL DEFAULT 'ID Verified',
  image TEXT NOT NULL,
  specialties TEXT[] NOT NULL DEFAULT '{}',
  bio TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Experiences
CREATE TABLE IF NOT EXISTS experiences (
  id VARCHAR(64) PRIMARY KEY,
  companion_id VARCHAR(64) NOT NULL REFERENCES companions(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  duration VARCHAR(128) NOT NULL,
  location VARCHAR(255) NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  includes TEXT[] NOT NULL DEFAULT '{}',
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Availability
CREATE TABLE IF NOT EXISTS availability (
  id VARCHAR(64) PRIMARY KEY,
  companion_id VARCHAR(64) NOT NULL REFERENCES companions(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  slot_time VARCHAR(64),
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_companion_date UNIQUE (companion_id, date)
);

-- 6. Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id VARCHAR(64) PRIMARY KEY,
  customer_id VARCHAR(64) NOT NULL REFERENCES users(id),
  companion_id VARCHAR(64) NOT NULL REFERENCES companions(id),
  experience_id VARCHAR(64) NOT NULL REFERENCES experiences(id),
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  party_size INT NOT NULL DEFAULT 1 CHECK (party_size BETWEEN 1 AND 10),
  notes TEXT DEFAULT '',
  status VARCHAR(32) NOT NULL CHECK (status IN ('requested', 'accepted', 'confirmed', 'in_progress', 'completed', 'reviewed', 'declined', 'cancelled', 'no_show', 'disputed')),
  total_price NUMERIC(10, 2) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  cancelled_by VARCHAR(32) CHECK (cancelled_by IS NULL OR cancelled_by IN ('customer', 'companion', 'admin', 'system')),
  rating INT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  review TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Booking Events (Audit trail for lifecycle transitions)
CREATE TABLE IF NOT EXISTS booking_events (
  id VARCHAR(64) PRIMARY KEY,
  booking_id VARCHAR(64) NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_status VARCHAR(32) NOT NULL,
  to_status VARCHAR(32) NOT NULL,
  actor_role VARCHAR(32) NOT NULL CHECK (actor_role IN ('customer', 'companion', 'admin', 'system')),
  actor_id VARCHAR(64) NOT NULL,
  notes TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Reviews
CREATE TABLE IF NOT EXISTS reviews (
  id VARCHAR(64) PRIMARY KEY,
  booking_id VARCHAR(64) NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id VARCHAR(64) NOT NULL REFERENCES users(id),
  companion_id VARCHAR(64) NOT NULL REFERENCES companions(id),
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Reports (Trust & Safety)
CREATE TABLE IF NOT EXISTS reports (
  id VARCHAR(64) PRIMARY KEY,
  reporter_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
  reported_user_id VARCHAR(64) REFERENCES users(id),
  booking_id VARCHAR(64) REFERENCES bookings(id),
  category VARCHAR(64) NOT NULL CHECK (category IN ('safety', 'behavior', 'payment', 'no_show', 'support', 'other')),
  description TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed')),
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Payments
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(64) PRIMARY KEY,
  booking_id VARCHAR(64) NOT NULL REFERENCES bookings(id),
  customer_id VARCHAR(64) NOT NULL REFERENCES users(id),
  amount NUMERIC(10, 2) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'captured', 'refunded', 'failed')),
  provider_tx_id VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Payouts
CREATE TABLE IF NOT EXISTS payouts (
  id VARCHAR(64) PRIMARY KEY,
  companion_id VARCHAR(64) NOT NULL REFERENCES companions(id),
  booking_id VARCHAR(64) NOT NULL REFERENCES bookings(id),
  amount NUMERIC(10, 2) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  provider_tx_id VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id),
  channel VARCHAR(32) NOT NULL CHECK (channel IN ('sms', 'email', 'in_app')),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  actor_id VARCHAR(64) NOT NULL,
  actor_role VARCHAR(32) NOT NULL CHECK (actor_role IN ('customer', 'companion', 'admin', 'system')),
  action VARCHAR(128) NOT NULL,
  target_type VARCHAR(64) NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  payload JSONB,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. Companion Verification / KYC Documents
CREATE TABLE IF NOT EXISTS kyc_verifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  companion_id VARCHAR(64) REFERENCES companions(id) ON DELETE CASCADE,
  document_type VARCHAR(32) NOT NULL CHECK (document_type IN ('aadhaar', 'passport', 'voter_id', 'pan')),
  document_number_masked VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('unverified', 'pending', 'verified', 'rejected')),
  provider_verification_id VARCHAR(128),
  rejection_reason TEXT,
  reviewer_admin_id VARCHAR(64) REFERENCES users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure companions table has verification_status column
ALTER TABLE companions ADD COLUMN IF NOT EXISTS verification_status VARCHAR(64) DEFAULT 'verified';

-- Indexes for production performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);
CREATE INDEX IF NOT EXISTS idx_companions_category ON companions(category);
CREATE INDEX IF NOT EXISTS idx_experiences_companion ON experiences(companion_id);
CREATE INDEX IF NOT EXISTS idx_availability_companion_date ON availability(companion_id, date);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_companion ON bookings(companion_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_booking_events_booking ON booking_events(booking_id);
CREATE INDEX IF NOT EXISTS idx_reviews_companion ON reviews(companion_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payouts_companion ON payouts(companion_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_user ON kyc_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_companion ON kyc_verifications(companion_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_status ON kyc_verifications(status);

-- Ensure payments table has provider_order_id and updated_at
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_order_id VARCHAR(128);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 15. Webhook Events (Idempotency and authoritative audit log for payment gateway callbacks)
CREATE TABLE IF NOT EXISTS webhook_events (
  id VARCHAR(128) PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  payload JSONB,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(provider_order_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON webhook_events(provider, event_type);

-- Ensure notifications table has idempotent delivery tracking and read status
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB;
CREATE INDEX IF NOT EXISTS idx_notifications_idempotency ON notifications(idempotency_key);

