import { Pool, PoolClient } from 'pg';
import { getHyderabadSeedData } from './seedData';
import { applySchema } from './schemaRunner';

export async function seedPostgres(db: Pool | PoolClient): Promise<void> {
  const data = getHyderabadSeedData();

  // 1. Users
  for (const u of data.users) {
    await db.query(
      `INSERT INTO users (id, email, role, name, phone, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         role = EXCLUDED.role,
         name = EXCLUDED.name,
         phone = EXCLUDED.phone,
         password_hash = EXCLUDED.password_hash,
         updated_at = EXCLUDED.updated_at`,
      [u.id, u.email, u.role, u.name, u.phone || null, u.passwordHash || null, u.createdAt, u.updatedAt]
    );
  }

  // Link auth_id for existing auth users if auth.users is present
  try {
    await db.query(`
      UPDATE users u
      SET auth_id = a.id::text
      FROM auth.users a
      WHERE LOWER(u.email) = LOWER(a.email)
    `);
  } catch {}

  // 2. Profiles
  for (const p of data.profiles) {
    await db.query(
      `INSERT INTO profiles (id, user_id, display_name, bio, avatar_url, city, id_verified, verification_status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         display_name = EXCLUDED.display_name,
         bio = EXCLUDED.bio,
         avatar_url = EXCLUDED.avatar_url,
         city = EXCLUDED.city,
         id_verified = EXCLUDED.id_verified,
         verification_status = EXCLUDED.verification_status,
         updated_at = EXCLUDED.updated_at`,
      [p.id, p.userId, p.displayName, p.bio || null, p.avatarUrl || null, p.city, p.idVerified, p.verificationStatus, p.createdAt, p.updatedAt]
    );
  }

  // 3. Companions
  for (const c of data.companions) {
    await db.query(
      `INSERT INTO companions (id, user_id, name, city, category, rate, rating, reviews, response, status, image, specialties, bio, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         name = EXCLUDED.name,
         city = EXCLUDED.city,
         category = EXCLUDED.category,
         rate = EXCLUDED.rate,
         rating = EXCLUDED.rating,
         reviews = EXCLUDED.reviews,
         response = EXCLUDED.response,
         status = EXCLUDED.status,
         image = EXCLUDED.image,
         specialties = EXCLUDED.specialties,
         bio = EXCLUDED.bio,
         updated_at = EXCLUDED.updated_at`,
      [c.id, c.userId || null, c.name, c.city, c.category, c.rate, c.rating, c.reviews, c.response, c.status, c.image, c.specialties, c.bio, c.createdAt, c.updatedAt]
    );
  }

  // 4. Experiences
  for (const exp of data.experiences) {
    await db.query(
      `INSERT INTO experiences (id, companion_id, title, duration, location, price, includes, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         companion_id = EXCLUDED.companion_id,
         title = EXCLUDED.title,
         duration = EXCLUDED.duration,
         location = EXCLUDED.location,
         price = EXCLUDED.price,
         includes = EXCLUDED.includes,
         description = EXCLUDED.description,
         updated_at = EXCLUDED.updated_at`,
      [exp.id, exp.companionId, exp.title, exp.duration, exp.location, exp.price, exp.includes, exp.description, exp.createdAt, exp.updatedAt]
    );
  }

  // 5. Availability
  for (const a of data.availability) {
    await db.query(
      `INSERT INTO availability (id, companion_id, date, slot_time, is_available, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (companion_id, date) DO UPDATE SET
         slot_time = EXCLUDED.slot_time,
         is_available = EXCLUDED.is_available`,
      [a.id, a.companionId, a.date, a.slotTime || null, a.isAvailable, a.createdAt]
    );
  }

  // 6. Bookings
  for (const b of data.bookings) {
    await db.query(
      `INSERT INTO bookings (id, customer_id, companion_id, experience_id, customer_name, customer_email, date, party_size, notes, status, total_price, currency, cancelled_by, rating, review, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (id) DO UPDATE SET
         customer_id = EXCLUDED.customer_id,
         companion_id = EXCLUDED.companion_id,
         experience_id = EXCLUDED.experience_id,
         customer_name = EXCLUDED.customer_name,
         customer_email = EXCLUDED.customer_email,
         date = EXCLUDED.date,
         party_size = EXCLUDED.party_size,
         notes = EXCLUDED.notes,
         status = EXCLUDED.status,
         total_price = EXCLUDED.total_price,
         currency = EXCLUDED.currency,
         cancelled_by = EXCLUDED.cancelled_by,
         rating = EXCLUDED.rating,
         review = EXCLUDED.review,
         updated_at = EXCLUDED.updated_at`,
      [
        b.id,
        b.customerId,
        b.companionId,
        b.experienceId,
        b.customerName,
        b.customerEmail,
        b.date,
        b.partySize,
        b.notes || '',
        b.status,
        b.totalPrice,
        b.currency,
        b.cancelledBy || null,
        b.rating !== undefined ? b.rating : null,
        b.review || null,
        b.createdAt,
        b.updatedAt
      ]
    );
  }

  // 7. Booking Events
  for (const be of data.bookingEvents) {
    await db.query(
      `INSERT INTO booking_events (id, booking_id, from_status, to_status, actor_role, actor_id, notes, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         booking_id = EXCLUDED.booking_id,
         from_status = EXCLUDED.from_status,
         to_status = EXCLUDED.to_status,
         actor_role = EXCLUDED.actor_role,
         actor_id = EXCLUDED.actor_id,
         notes = EXCLUDED.notes,
         timestamp = EXCLUDED.timestamp`,
      [be.id, be.bookingId, be.fromStatus, be.toStatus, be.actorRole, be.actorId, be.notes || null, be.timestamp]
    );
  }

  // 8. Audit Logs
  for (const al of data.auditLogs) {
    await db.query(
      `INSERT INTO audit_logs (id, actor_id, actor_role, action, target_type, target_id, payload, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [al.id, al.actorId, al.actorRole, al.action, al.targetType, al.targetId, al.payload ? JSON.stringify(al.payload) : null, al.ipAddress || null, al.createdAt]
    );
  }
}

export async function runSeed(): Promise<void> {
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile();
    } catch {}
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.log('[Seed] DATABASE_URL not set. Seed applies automatically to in-memory store.');
    return;
  }

  const isSsl =
    databaseUrl.includes('sslmode=require') ||
    databaseUrl.includes('sslmode=prefer') ||
    databaseUrl.includes('supabase.co') ||
    databaseUrl.includes('pooler.supabase.com') ||
    process.env.PGSSLMODE === 'require';

  const cleanConnectionString = databaseUrl
    .replace(/[?&]sslmode=[^&]+/g, '')
    .replace(/[?&]$/, '');

  const pool = new Pool({
    connectionString: cleanConnectionString,
    ssl: isSsl ? { rejectUnauthorized: false } : undefined
  });

  try {
    console.log('[Seed] Applying schema to PostgreSQL...');
    await applySchema(pool);
    console.log('[Seed] Seeding Hyderabad demo data...');
    await seedPostgres(pool);
    console.log('[Seed] PostgreSQL database seeded successfully.');
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Seed] Error seeding database:', err);
      process.exit(1);
    });
}
