import { Pool, QueryResult, QueryResultRow, types } from 'pg';
import {
  User,
  Profile,
  Companion,
  Experience,
  Availability,
  Booking,
  BookingEvent,
  Review,
  Report,
  Payment,
  Payout,
  Notification,
  AuditLog,
  BookingStatus,
  BookingActorRole,
  UserRole,
  VerificationStatus,
  ReportCategory,
  ReportStatus,
  PaymentStatus,
  PayoutStatus,
  NotificationChannel,
  NotificationStatus,
  KycVerification,
  WebhookEvent
} from '../models';
import { IDatabaseStore } from './memoryStore';
import { applySchema } from './schemaRunner';
import { seedPostgres } from './seed';

// Configure node-postgres parsers for predictable type conversions
// 1082 = DATE OID: return formatted string 'YYYY-MM-DD' directly
types.setTypeParser(1082, (val: string) => val);
// 1700 = NUMERIC OID: return JavaScript float
types.setTypeParser(1700, (val: string) => (val === null ? null : parseFloat(val)));

export class PostgresStore implements IDatabaseStore {
  private pool: Pool;
  private initPromise: Promise<void> | null = null;

  constructor(connectionString: string) {
    const isSsl =
      connectionString.includes('sslmode=require') ||
      connectionString.includes('sslmode=prefer') ||
      connectionString.includes('supabase.co') ||
      connectionString.includes('pooler.supabase.com') ||
      process.env.PGSSLMODE === 'require';

    // Strip sslmode from query string if present to avoid pg-connection-string overriding ssl object
    const cleanConnectionString = connectionString
      .replace(/[?&]sslmode=[^&]+/g, '')
      .replace(/[?&]$/, '');

    this.pool = new Pool({
      connectionString: cleanConnectionString,
      ssl: isSsl ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.PG_MAX_POOL_SIZE || 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });

    this.pool.on('error', (err) => {
      console.error('[Database] Unexpected error on idle PostgreSQL client:', err.message);
    });
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  public async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          await applySchema(this.pool);
          // Check if database needs seeding
          const res = await this.pool.query('SELECT COUNT(*)::int AS count FROM companions;');
          if (res.rows[0]?.count === 0) {
            console.log('[Database] Empty database detected. Auto-seeding Hyderabad demo dataset...');
            await seedPostgres(this.pool);
            console.log('[Database] Auto-seeding complete.');
          }
        } catch (err: any) {
          console.error('[Database] Initialization error:', err.message);
          throw err;
        }
      })();
    }
    return this.initPromise;
  }

  public async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    await this.ensureInitialized();
    return this.pool.query<T>(text, params);
  }

  // --- Row Mappers ---

  private formatIsoDate(d: any): string {
    if (!d) return new Date().toISOString();
    if (d instanceof Date) return d.toISOString();
    return String(d);
  }

  private formatDateOnly(d: any): string {
    if (!d) return '';
    if (typeof d === 'string') return d.split('T')[0];
    if (d instanceof Date) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return String(d);
  }

  private mapUser(row: any): User {
    return {
      id: row.id,
      email: row.email,
      role: row.role as UserRole,
      name: row.name,
      phone: row.phone ?? undefined,
      passwordHash: row.password_hash ?? undefined,
      authId: row.auth_id ?? undefined,
      createdAt: this.formatIsoDate(row.created_at),
      updatedAt: this.formatIsoDate(row.updated_at)
    };
  }

  private mapProfile(row: any): Profile {
    return {
      id: row.id,
      userId: row.user_id,
      displayName: row.display_name,
      bio: row.bio ?? undefined,
      avatarUrl: row.avatar_url ?? undefined,
      city: row.city,
      idVerified: Boolean(row.id_verified),
      verificationStatus: row.verification_status as VerificationStatus,
      createdAt: this.formatIsoDate(row.created_at),
      updatedAt: this.formatIsoDate(row.updated_at)
    };
  }

  private mapCompanion(row: any): Companion {
    return {
      id: row.id,
      userId: row.user_id ?? undefined,
      name: row.name,
      city: row.city,
      category: row.category,
      rate: Number(row.rate),
      rating: Number(row.rating),
      reviews: Number(row.reviews),
      response: row.response,
      status: row.status,
      verificationStatus: (row.verification_status || (row.status === 'ID Verified' ? 'verified' : 'unverified')) as VerificationStatus,
      image: row.image,
      specialties: Array.isArray(row.specialties) ? row.specialties : [],
      bio: row.bio,
      createdAt: this.formatIsoDate(row.created_at),
      updatedAt: this.formatIsoDate(row.updated_at)
    };
  }

  private mapExperience(row: any): Experience {
    return {
      id: row.id,
      companionId: row.companion_id,
      title: row.title,
      duration: row.duration,
      location: row.location,
      price: Number(row.price),
      includes: Array.isArray(row.includes) ? row.includes : [],
      description: row.description,
      createdAt: this.formatIsoDate(row.created_at),
      updatedAt: this.formatIsoDate(row.updated_at)
    };
  }

  private mapAvailability(row: any): Availability {
    return {
      id: row.id,
      companionId: row.companion_id,
      date: this.formatDateOnly(row.date),
      slotTime: row.slot_time ?? undefined,
      isAvailable: Boolean(row.is_available),
      createdAt: this.formatIsoDate(row.created_at)
    };
  }

  private mapBooking(row: any): Booking {
    return {
      id: row.id,
      customerId: row.customer_id,
      companionId: row.companion_id,
      experienceId: row.experience_id,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      date: this.formatDateOnly(row.date),
      partySize: Number(row.party_size),
      notes: row.notes ?? '',
      status: row.status as BookingStatus,
      totalPrice: Number(row.total_price),
      currency: row.currency || 'INR',
      cancelledBy: row.cancelled_by ?? undefined,
      rating: row.rating !== null && row.rating !== undefined ? Number(row.rating) : undefined,
      review: row.review ?? undefined,
      createdAt: this.formatIsoDate(row.created_at),
      updatedAt: this.formatIsoDate(row.updated_at)
    };
  }

  private mapBookingEvent(row: any): BookingEvent {
    return {
      id: row.id,
      bookingId: row.booking_id,
      fromStatus: row.from_status as BookingStatus,
      toStatus: row.to_status as BookingStatus,
      actorRole: row.actor_role as BookingActorRole,
      actorId: row.actor_id,
      notes: row.notes ?? undefined,
      timestamp: this.formatIsoDate(row.timestamp)
    };
  }

  private mapReview(row: any): Review {
    return {
      id: row.id,
      bookingId: row.booking_id,
      customerId: row.customer_id,
      companionId: row.companion_id,
      rating: Number(row.rating),
      reviewText: row.review_text,
      createdAt: this.formatIsoDate(row.created_at)
    };
  }

  private mapReport(row: any): Report {
    return {
      id: row.id,
      reporterUserId: row.reporter_user_id,
      reportedUserId: row.reported_user_id ?? undefined,
      bookingId: row.booking_id ?? undefined,
      category: row.category as ReportCategory,
      description: row.description,
      status: row.status as ReportStatus,
      resolutionNotes: row.resolution_notes ?? undefined,
      resolvedAt: row.resolved_at ? this.formatIsoDate(row.resolved_at) : undefined,
      createdAt: this.formatIsoDate(row.created_at)
    };
  }

  private mapPayment(row: any): Payment {
    return {
      id: row.id,
      bookingId: row.booking_id,
      customerId: row.customer_id,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status as PaymentStatus,
      providerTxId: row.provider_tx_id ?? '',
      providerOrderId: row.provider_order_id ?? undefined,
      createdAt: this.formatIsoDate(row.created_at),
      updatedAt: row.updated_at ? this.formatIsoDate(row.updated_at) : undefined
    };
  }

  private mapWebhookEvent(row: any): WebhookEvent {
    let payload = row.payload;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {}
    }
    return {
      id: row.id,
      eventType: row.event_type,
      provider: row.provider,
      payload,
      processedAt: this.formatIsoDate(row.processed_at)
    };
  }

  private mapPayout(row: any): Payout {
    return {
      id: row.id,
      companionId: row.companion_id,
      bookingId: row.booking_id,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status as PayoutStatus,
      providerTxId: row.provider_tx_id ?? '',
      createdAt: this.formatIsoDate(row.created_at)
    };
  }

  private mapNotification(row: any): Notification {
    let metadata = row.metadata;
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch {}
    }
    return {
      id: row.id,
      userId: row.user_id,
      channel: row.channel as NotificationChannel,
      title: row.title,
      message: row.message,
      status: row.status as NotificationStatus,
      createdAt: this.formatIsoDate(row.created_at),
      readAt: row.read_at ? this.formatIsoDate(row.read_at) : undefined,
      idempotencyKey: row.idempotency_key || undefined,
      metadata: metadata || undefined
    };
  }


  private mapAuditLog(row: any): AuditLog {
    let payload = row.payload;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {}
    }
    return {
      id: row.id,
      actorId: row.actor_id,
      actorRole: row.actor_role as BookingActorRole,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      payload: payload ?? undefined,
      ipAddress: row.ip_address ?? undefined,
      createdAt: this.formatIsoDate(row.created_at)
    };
  }

  private mapKycVerification(row: any): KycVerification {
    return {
      id: row.id,
      userId: row.user_id,
      companionId: row.companion_id ?? undefined,
      documentType: row.document_type,
      documentNumberMasked: row.document_number_masked,
      status: row.status as VerificationStatus,
      providerVerificationId: row.provider_verification_id ?? undefined,
      rejectionReason: row.rejection_reason ?? undefined,
      reviewerAdminId: row.reviewer_admin_id ?? undefined,
      submittedAt: this.formatIsoDate(row.submitted_at),
      reviewedAt: row.reviewed_at ? this.formatIsoDate(row.reviewed_at) : undefined,
      createdAt: this.formatIsoDate(row.created_at),
      updatedAt: this.formatIsoDate(row.updated_at)
    };
  }

  // --- 1. Users ---

  async getUsers(): Promise<User[]> {
    const res = await this.query('SELECT * FROM users ORDER BY created_at ASC');
    return res.rows.map((r) => this.mapUser(r));
  }

  async getUserById(id: string): Promise<User | undefined> {
    const res = await this.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0] ? this.mapUser(res.rows[0]) : undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const res = await this.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    return res.rows[0] ? this.mapUser(res.rows[0]) : undefined;
  }

  async getUserByAuthId(authId: string): Promise<User | undefined> {
    const res = await this.query('SELECT * FROM users WHERE auth_id = $1', [authId]);
    return res.rows[0] ? this.mapUser(res.rows[0]) : undefined;
  }

  async createUser(user: User): Promise<User> {
    const res = await this.query(
      `INSERT INTO users (id, email, role, name, phone, password_hash, auth_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         role = EXCLUDED.role,
         name = EXCLUDED.name,
         phone = EXCLUDED.phone,
         password_hash = EXCLUDED.password_hash,
         auth_id = COALESCE(EXCLUDED.auth_id, users.auth_id),
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [
        user.id,
        user.email,
        user.role,
        user.name,
        user.phone || null,
        user.passwordHash || null,
        user.authId || null,
        user.createdAt,
        user.updatedAt
      ]
    );
    return this.mapUser(res.rows[0]);
  }

  // --- 2. Profiles ---

  async getProfiles(): Promise<Profile[]> {
    const res = await this.query('SELECT * FROM profiles ORDER BY created_at ASC');
    return res.rows.map((r) => this.mapProfile(r));
  }

  async getProfileByUserId(userId: string): Promise<Profile | undefined> {
    const res = await this.query('SELECT * FROM profiles WHERE user_id = $1', [userId]);
    return res.rows[0] ? this.mapProfile(res.rows[0]) : undefined;
  }

  async upsertProfile(profile: Profile): Promise<Profile> {
    const res = await this.query(
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
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [
        profile.id,
        profile.userId,
        profile.displayName,
        profile.bio || null,
        profile.avatarUrl || null,
        profile.city,
        profile.idVerified,
        profile.verificationStatus,
        profile.createdAt,
        profile.updatedAt
      ]
    );
    return this.mapProfile(res.rows[0]);
  }

  // --- 3. Companions ---

  async getCompanions(): Promise<Companion[]> {
    const res = await this.query(
      'SELECT id, user_id, name, city, category, rate::float, rating::float, reviews, response, status, image, specialties, bio, created_at, updated_at FROM companions ORDER BY rating DESC, reviews DESC'
    );
    return res.rows.map((r) => this.mapCompanion(r));
  }

  async getCompanionById(id: string): Promise<Companion | undefined> {
    const res = await this.query(
      'SELECT id, user_id, name, city, category, rate::float, rating::float, reviews, response, status, image, specialties, bio, created_at, updated_at FROM companions WHERE id = $1',
      [id]
    );
    return res.rows[0] ? this.mapCompanion(res.rows[0]) : undefined;
  }

  async upsertCompanion(companion: Companion): Promise<Companion> {
    const res = await this.query(
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
         updated_at = EXCLUDED.updated_at
       RETURNING id, user_id, name, city, category, rate::float, rating::float, reviews, response, status, image, specialties, bio, created_at, updated_at`,
      [
        companion.id,
        companion.userId || null,
        companion.name,
        companion.city,
        companion.category,
        companion.rate,
        companion.rating,
        companion.reviews,
        companion.response,
        companion.status,
        companion.image,
        companion.specialties || [],
        companion.bio,
        companion.createdAt,
        companion.updatedAt
      ]
    );
    return this.mapCompanion(res.rows[0]);
  }

  // --- 4. Experiences ---

  async getExperiences(): Promise<Experience[]> {
    const res = await this.query(
      'SELECT id, companion_id, title, duration, location, price::float, includes, description, created_at, updated_at FROM experiences ORDER BY price ASC'
    );
    return res.rows.map((r) => this.mapExperience(r));
  }

  async getExperiencesByCompanionId(companionId: string): Promise<Experience[]> {
    const res = await this.query(
      'SELECT id, companion_id, title, duration, location, price::float, includes, description, created_at, updated_at FROM experiences WHERE companion_id = $1 ORDER BY price ASC',
      [companionId]
    );
    return res.rows.map((r) => this.mapExperience(r));
  }

  async getExperienceById(id: string): Promise<Experience | undefined> {
    const res = await this.query(
      'SELECT id, companion_id, title, duration, location, price::float, includes, description, created_at, updated_at FROM experiences WHERE id = $1',
      [id]
    );
    return res.rows[0] ? this.mapExperience(res.rows[0]) : undefined;
  }

  // --- 5. Availability ---

  async getAvailability(companionId: string): Promise<Availability[]> {
    const res = await this.query(
      'SELECT id, companion_id, date::text as date, slot_time, is_available, created_at FROM availability WHERE companion_id = $1 AND is_available = TRUE ORDER BY date ASC',
      [companionId]
    );
    return res.rows.map((r) => this.mapAvailability(r));
  }

  async isCompanionAvailable(companionId: string, date: string): Promise<boolean> {
    const dateFormatted = this.formatDateOnly(date);
    const res = await this.query(
      'SELECT is_available FROM availability WHERE companion_id = $1 AND date = $2',
      [companionId, dateFormatted]
    );
    return res.rows.length > 0 && Boolean(res.rows[0].is_available);
  }

  async setAvailability(availability: Availability): Promise<Availability> {
    const res = await this.query(
      `INSERT INTO availability (id, companion_id, date, slot_time, is_available, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (companion_id, date) DO UPDATE SET
         slot_time = EXCLUDED.slot_time,
         is_available = EXCLUDED.is_available
       RETURNING id, companion_id, date::text as date, slot_time, is_available, created_at`,
      [
        availability.id,
        availability.companionId,
        this.formatDateOnly(availability.date),
        availability.slotTime || null,
        availability.isAvailable,
        availability.createdAt
      ]
    );
    return this.mapAvailability(res.rows[0]);
  }

  // --- 6. Bookings ---

  async getBookings(): Promise<Booking[]> {
    const res = await this.query(
      `SELECT id, customer_id, companion_id, experience_id, customer_name, customer_email,
              date::text as date, party_size, notes, status, total_price::float as total_price, currency,
              cancelled_by, rating, review, created_at, updated_at
       FROM bookings
       ORDER BY created_at DESC`
    );
    return res.rows.map((r) => this.mapBooking(r));
  }

  async getBookingById(id: string): Promise<Booking | undefined> {
    const res = await this.query(
      `SELECT id, customer_id, companion_id, experience_id, customer_name, customer_email,
              date::text as date, party_size, notes, status, total_price::float as total_price, currency,
              cancelled_by, rating, review, created_at, updated_at
       FROM bookings
       WHERE id = $1`,
      [id]
    );
    return res.rows[0] ? this.mapBooking(res.rows[0]) : undefined;
  }

  async createBooking(booking: Booking): Promise<Booking> {
    const res = await this.query(
      `INSERT INTO bookings (
         id, customer_id, companion_id, experience_id, customer_name, customer_email,
         date, party_size, notes, status, total_price, currency, cancelled_by, rating, review,
         created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING id, customer_id, companion_id, experience_id, customer_name, customer_email,
                 date::text as date, party_size, notes, status, total_price::float as total_price, currency,
                 cancelled_by, rating, review, created_at, updated_at`,
      [
        booking.id,
        booking.customerId,
        booking.companionId,
        booking.experienceId,
        booking.customerName,
        booking.customerEmail,
        this.formatDateOnly(booking.date),
        booking.partySize,
        booking.notes || '',
        booking.status,
        booking.totalPrice,
        booking.currency || 'INR',
        booking.cancelledBy || null,
        booking.rating !== undefined ? booking.rating : null,
        booking.review || null,
        booking.createdAt,
        booking.updatedAt
      ]
    );
    return this.mapBooking(res.rows[0]);
  }

  async updateBooking(id: string, updates: Partial<Booking>): Promise<Booking | undefined> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const columnMap: Record<string, string> = {
      customerId: 'customer_id',
      companionId: 'companion_id',
      experienceId: 'experience_id',
      customerName: 'customer_name',
      customerEmail: 'customer_email',
      date: 'date',
      partySize: 'party_size',
      notes: 'notes',
      status: 'status',
      totalPrice: 'total_price',
      currency: 'currency',
      cancelledBy: 'cancelled_by',
      rating: 'rating',
      review: 'review'
    };

    for (const [key, col] of Object.entries(columnMap)) {
      if (key in updates) {
        setClauses.push(`${col} = $${paramIndex++}`);
        let val = (updates as any)[key];
        if (key === 'date') val = this.formatDateOnly(val);
        values.push(val);
      }
    }

    setClauses.push(`updated_at = $${paramIndex++}`);
    values.push(updates.updatedAt || new Date().toISOString());

    values.push(id);
    const sql = `
      UPDATE bookings
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, customer_id, companion_id, experience_id, customer_name, customer_email,
                date::text as date, party_size, notes, status, total_price::float as total_price, currency,
                cancelled_by, rating, review, created_at, updated_at
    `;

    const res = await this.query(sql, values);
    return res.rows[0] ? this.mapBooking(res.rows[0]) : undefined;
  }

  // --- 7. Booking Events ---

  async getBookingEvents(bookingId: string): Promise<BookingEvent[]> {
    const res = await this.query(
      'SELECT id, booking_id, from_status, to_status, actor_role, actor_id, notes, timestamp FROM booking_events WHERE booking_id = $1 ORDER BY timestamp ASC',
      [bookingId]
    );
    return res.rows.map((r) => this.mapBookingEvent(r));
  }

  async createBookingEvent(event: BookingEvent): Promise<BookingEvent> {
    const res = await this.query(
      `INSERT INTO booking_events (id, booking_id, from_status, to_status, actor_role, actor_id, notes, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, booking_id, from_status, to_status, actor_role, actor_id, notes, timestamp`,
      [
        event.id,
        event.bookingId,
        event.fromStatus,
        event.toStatus,
        event.actorRole,
        event.actorId,
        event.notes || null,
        event.timestamp
      ]
    );
    return this.mapBookingEvent(res.rows[0]);
  }

  // --- 8. Reviews ---

  async getReviews(companionId?: string): Promise<Review[]> {
    let sql = 'SELECT id, booking_id, customer_id, companion_id, rating, review_text, created_at FROM reviews';
    const params: any[] = [];
    if (companionId) {
      sql += ' WHERE companion_id = $1';
      params.push(companionId);
    }
    sql += ' ORDER BY created_at DESC';

    const res = await this.query(sql, params);
    return res.rows.map((r) => this.mapReview(r));
  }

  async createReview(review: Review): Promise<Review> {
    const res = await this.query(
      `INSERT INTO reviews (id, booking_id, customer_id, companion_id, rating, review_text, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, booking_id, customer_id, companion_id, rating, review_text, created_at`,
      [
        review.id,
        review.bookingId,
        review.customerId,
        review.companionId,
        review.rating,
        review.reviewText,
        review.createdAt
      ]
    );
    return this.mapReview(res.rows[0]);
  }

  // --- 9. Reports ---

  async getReports(): Promise<Report[]> {
    const res = await this.query(
      'SELECT id, reporter_user_id, reported_user_id, booking_id, category, description, status, resolution_notes, resolved_at, created_at FROM reports ORDER BY created_at DESC'
    );
    return res.rows.map((r) => this.mapReport(r));
  }

  async getReportById(id: string): Promise<Report | undefined> {
    const res = await this.query(
      'SELECT id, reporter_user_id, reported_user_id, booking_id, category, description, status, resolution_notes, resolved_at, created_at FROM reports WHERE id = $1',
      [id]
    );
    return res.rows[0] ? this.mapReport(res.rows[0]) : undefined;
  }

  async createReport(report: Report): Promise<Report> {
    const res = await this.query(
      `INSERT INTO reports (id, reporter_user_id, reported_user_id, booking_id, category, description, status, resolution_notes, resolved_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, reporter_user_id, reported_user_id, booking_id, category, description, status, resolution_notes, resolved_at, created_at`,
      [
        report.id,
        report.reporterUserId,
        report.reportedUserId || null,
        report.bookingId || null,
        report.category,
        report.description,
        report.status,
        report.resolutionNotes || null,
        report.resolvedAt || null,
        report.createdAt
      ]
    );
    return this.mapReport(res.rows[0]);
  }

  async updateReport(id: string, updates: Partial<Report>): Promise<Report | undefined> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const columnMap: Record<string, string> = {
      reporterUserId: 'reporter_user_id',
      reportedUserId: 'reported_user_id',
      bookingId: 'booking_id',
      category: 'category',
      description: 'description',
      status: 'status',
      resolutionNotes: 'resolution_notes',
      resolvedAt: 'resolved_at'
    };

    for (const [key, col] of Object.entries(columnMap)) {
      if (key in updates) {
        setClauses.push(`${col} = $${paramIndex++}`);
        values.push((updates as any)[key]);
      }
    }

    if (setClauses.length === 0) {
      return this.getReportById(id);
    }

    values.push(id);
    const sql = `
      UPDATE reports
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, reporter_user_id, reported_user_id, booking_id, category, description, status, resolution_notes, resolved_at, created_at
    `;

    const res = await this.query(sql, values);
    return res.rows[0] ? this.mapReport(res.rows[0]) : undefined;
  }

  // --- 10. Payments ---

  async getPayments(): Promise<Payment[]> {
    const res = await this.query(
      'SELECT id, booking_id, customer_id, amount::float as amount, currency, status, provider_tx_id, provider_order_id, created_at, updated_at FROM payments ORDER BY created_at DESC'
    );
    return res.rows.map((r) => this.mapPayment(r));
  }

  async getPaymentById(id: string): Promise<Payment | undefined> {
    const res = await this.query(
      'SELECT id, booking_id, customer_id, amount::float as amount, currency, status, provider_tx_id, provider_order_id, created_at, updated_at FROM payments WHERE id = $1',
      [id]
    );
    return res.rows[0] ? this.mapPayment(res.rows[0]) : undefined;
  }

  async getPaymentByBookingId(bookingId: string): Promise<Payment | undefined> {
    const res = await this.query(
      'SELECT id, booking_id, customer_id, amount::float as amount, currency, status, provider_tx_id, provider_order_id, created_at, updated_at FROM payments WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 1',
      [bookingId]
    );
    return res.rows[0] ? this.mapPayment(res.rows[0]) : undefined;
  }

  async getPaymentByOrderId(orderId: string): Promise<Payment | undefined> {
    const res = await this.query(
      'SELECT id, booking_id, customer_id, amount::float as amount, currency, status, provider_tx_id, provider_order_id, created_at, updated_at FROM payments WHERE provider_order_id = $1 OR provider_tx_id = $1 LIMIT 1',
      [orderId]
    );
    return res.rows[0] ? this.mapPayment(res.rows[0]) : undefined;
  }

  async createPayment(payment: Payment): Promise<Payment> {
    const res = await this.query(
      `INSERT INTO payments (id, booking_id, customer_id, amount, currency, status, provider_tx_id, provider_order_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, booking_id, customer_id, amount::float as amount, currency, status, provider_tx_id, provider_order_id, created_at, updated_at`,
      [
        payment.id,
        payment.bookingId,
        payment.customerId,
        payment.amount,
        payment.currency,
        payment.status,
        payment.providerTxId || null,
        payment.providerOrderId || null,
        payment.createdAt,
        payment.updatedAt || payment.createdAt
      ]
    );
    return this.mapPayment(res.rows[0]);
  }

  async updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | undefined> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(updates.status);
    }
    if (updates.providerTxId !== undefined) {
      fields.push(`provider_tx_id = $${idx++}`);
      values.push(updates.providerTxId);
    }
    if (updates.providerOrderId !== undefined) {
      fields.push(`provider_order_id = $${idx++}`);
      values.push(updates.providerOrderId);
    }

    fields.push(`updated_at = $${idx++}`);
    values.push(new Date().toISOString());

    values.push(id);
    const res = await this.query(
      `UPDATE payments SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, booking_id, customer_id, amount::float as amount, currency, status, provider_tx_id, provider_order_id, created_at, updated_at`,
      values
    );

    return res.rows[0] ? this.mapPayment(res.rows[0]) : undefined;
  }

  // --- 11. Payouts ---

  async getPayouts(): Promise<Payout[]> {
    const res = await this.query(
      'SELECT id, companion_id, booking_id, amount::float as amount, currency, status, provider_tx_id, created_at FROM payouts ORDER BY created_at DESC'
    );
    return res.rows.map((r) => this.mapPayout(r));
  }

  async getPayoutById(id: string): Promise<Payout | undefined> {
    const res = await this.query(
      'SELECT id, companion_id, booking_id, amount::float as amount, currency, status, provider_tx_id, created_at FROM payouts WHERE id = $1',
      [id]
    );
    return res.rows[0] ? this.mapPayout(res.rows[0]) : undefined;
  }

  async getPayoutByBookingId(bookingId: string): Promise<Payout | undefined> {
    const res = await this.query(
      'SELECT id, companion_id, booking_id, amount::float as amount, currency, status, provider_tx_id, created_at FROM payouts WHERE booking_id = $1 LIMIT 1',
      [bookingId]
    );
    return res.rows[0] ? this.mapPayout(res.rows[0]) : undefined;
  }

  async createPayout(payout: Payout): Promise<Payout> {
    const res = await this.query(
      `INSERT INTO payouts (id, companion_id, booking_id, amount, currency, status, provider_tx_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, companion_id, booking_id, amount::float as amount, currency, status, provider_tx_id, created_at`,
      [
        payout.id,
        payout.companionId,
        payout.bookingId,
        payout.amount,
        payout.currency,
        payout.status,
        payout.providerTxId || null,
        payout.createdAt
      ]
    );
    return this.mapPayout(res.rows[0]);
  }

  async updatePayout(id: string, updates: Partial<Payout>): Promise<Payout | undefined> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(updates.status);
    }
    if (updates.providerTxId !== undefined) {
      fields.push(`provider_tx_id = $${idx++}`);
      values.push(updates.providerTxId);
    }

    values.push(id);
    const res = await this.query(
      `UPDATE payouts SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, companion_id, booking_id, amount::float as amount, currency, status, provider_tx_id, created_at`,
      values
    );

    return res.rows[0] ? this.mapPayout(res.rows[0]) : undefined;
  }

  // --- Webhook Events ---

  async getWebhookEvent(id: string): Promise<WebhookEvent | undefined> {
    const res = await this.query(
      'SELECT id, event_type, provider, payload, processed_at FROM webhook_events WHERE id = $1',
      [id]
    );
    return res.rows[0] ? this.mapWebhookEvent(res.rows[0]) : undefined;
  }

  async createWebhookEvent(event: WebhookEvent): Promise<WebhookEvent> {
    const res = await this.query(
      `INSERT INTO webhook_events (id, event_type, provider, payload, processed_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING
       RETURNING id, event_type, provider, payload, processed_at`,
      [
        event.id,
        event.eventType,
        event.provider,
        event.payload ? JSON.stringify(event.payload) : null,
        event.processedAt
      ]
    );
    return res.rows[0] ? this.mapWebhookEvent(res.rows[0]) : event;
  }

  // --- 12. Notifications ---

  async getNotifications(userId?: string): Promise<Notification[]> {
    let sql = 'SELECT id, user_id, channel, title, message, status, created_at, read_at, idempotency_key, metadata FROM notifications';
    const params: any[] = [];
    if (userId) {
      sql += ' WHERE user_id = $1';
      params.push(userId);
    }
    sql += ' ORDER BY created_at DESC';

    const res = await this.query(sql, params);
    return res.rows.map((r) => this.mapNotification(r));
  }

  async getNotificationById(id: string): Promise<Notification | undefined> {
    const res = await this.query(
      'SELECT id, user_id, channel, title, message, status, created_at, read_at, idempotency_key, metadata FROM notifications WHERE id = $1',
      [id]
    );
    return res.rows[0] ? this.mapNotification(res.rows[0]) : undefined;
  }

  async getNotificationByIdempotencyKey(key: string): Promise<Notification | undefined> {
    const res = await this.query(
      'SELECT id, user_id, channel, title, message, status, created_at, read_at, idempotency_key, metadata FROM notifications WHERE idempotency_key = $1',
      [key]
    );
    return res.rows[0] ? this.mapNotification(res.rows[0]) : undefined;
  }

  async createNotification(notification: Notification): Promise<Notification> {
    const res = await this.query(
      `INSERT INTO notifications (id, user_id, channel, title, message, status, created_at, read_at, idempotency_key, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, user_id, channel, title, message, status, created_at, read_at, idempotency_key, metadata`,
      [
        notification.id,
        notification.userId,
        notification.channel,
        notification.title,
        notification.message,
        notification.status,
        notification.createdAt,
        notification.readAt || null,
        notification.idempotencyKey || null,
        notification.metadata ? JSON.stringify(notification.metadata) : null
      ]
    );
    return this.mapNotification(res.rows[0]);
  }

  async updateNotification(id: string, updates: Partial<Notification>): Promise<Notification | undefined> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(updates.status);
    }
    if (updates.readAt !== undefined) {
      fields.push(`read_at = $${idx++}`);
      values.push(updates.readAt);
    }
    if (updates.metadata !== undefined) {
      fields.push(`metadata = $${idx++}`);
      values.push(JSON.stringify(updates.metadata));
    }

    if (fields.length === 0) {
      return this.getNotificationById(id);
    }

    values.push(id);
    const res = await this.query(
      `UPDATE notifications SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, user_id, channel, title, message, status, created_at, read_at, idempotency_key, metadata`,
      values
    );
    return res.rows[0] ? this.mapNotification(res.rows[0]) : undefined;
  }


  // --- 13. Audit Logs ---

  async getAuditLogs(): Promise<AuditLog[]> {
    const res = await this.query(
      'SELECT id, actor_id, actor_role, action, target_type, target_id, payload, ip_address, created_at FROM audit_logs ORDER BY created_at DESC'
    );
    return res.rows.map((r) => this.mapAuditLog(r));
  }

  async createAuditLog(log: AuditLog): Promise<AuditLog> {
    const res = await this.query(
      `INSERT INTO audit_logs (id, actor_id, actor_role, action, target_type, target_id, payload, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, actor_id, actor_role, action, target_type, target_id, payload, ip_address, created_at`,
      [
        log.id,
        log.actorId,
        log.actorRole,
        log.action,
        log.targetType,
        log.targetId,
        log.payload ? JSON.stringify(log.payload) : null,
        log.ipAddress || null,
        log.createdAt
      ]
    );
    return this.mapAuditLog(res.rows[0]);
  }

  // --- 14. KYC Verifications ---

  async getKycVerifications(): Promise<KycVerification[]> {
    const res = await this.query(
      'SELECT id, user_id, companion_id, document_type, document_number_masked, status, provider_verification_id, rejection_reason, reviewer_admin_id, submitted_at, reviewed_at, created_at, updated_at FROM kyc_verifications ORDER BY submitted_at DESC'
    );
    return res.rows.map((r) => this.mapKycVerification(r));
  }

  async getKycVerificationById(id: string): Promise<KycVerification | undefined> {
    const res = await this.query(
      'SELECT id, user_id, companion_id, document_type, document_number_masked, status, provider_verification_id, rejection_reason, reviewer_admin_id, submitted_at, reviewed_at, created_at, updated_at FROM kyc_verifications WHERE id = $1',
      [id]
    );
    return res.rows[0] ? this.mapKycVerification(res.rows[0]) : undefined;
  }

  async getKycVerificationsByUserId(userId: string): Promise<KycVerification[]> {
    const res = await this.query(
      'SELECT id, user_id, companion_id, document_type, document_number_masked, status, provider_verification_id, rejection_reason, reviewer_admin_id, submitted_at, reviewed_at, created_at, updated_at FROM kyc_verifications WHERE user_id = $1 ORDER BY submitted_at DESC',
      [userId]
    );
    return res.rows.map((r) => this.mapKycVerification(r));
  }

  async createKycVerification(verification: KycVerification): Promise<KycVerification> {
    const res = await this.query(
      `INSERT INTO kyc_verifications (id, user_id, companion_id, document_type, document_number_masked, status, provider_verification_id, rejection_reason, reviewer_admin_id, submitted_at, reviewed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, user_id, companion_id, document_type, document_number_masked, status, provider_verification_id, rejection_reason, reviewer_admin_id, submitted_at, reviewed_at, created_at, updated_at`,
      [
        verification.id,
        verification.userId,
        verification.companionId || null,
        verification.documentType,
        verification.documentNumberMasked,
        verification.status,
        verification.providerVerificationId || null,
        verification.rejectionReason || null,
        verification.reviewerAdminId || null,
        verification.submittedAt,
        verification.reviewedAt || null,
        verification.createdAt,
        verification.updatedAt
      ]
    );
    return this.mapKycVerification(res.rows[0]);
  }

  async updateKycVerification(id: string, updates: Partial<KycVerification>): Promise<KycVerification | undefined> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(updates.status);
    }
    if (updates.providerVerificationId !== undefined) {
      fields.push(`provider_verification_id = $${idx++}`);
      values.push(updates.providerVerificationId);
    }
    if (updates.rejectionReason !== undefined) {
      fields.push(`rejection_reason = $${idx++}`);
      values.push(updates.rejectionReason);
    }
    if (updates.reviewerAdminId !== undefined) {
      fields.push(`reviewer_admin_id = $${idx++}`);
      values.push(updates.reviewerAdminId);
    }
    if (updates.reviewedAt !== undefined) {
      fields.push(`reviewed_at = $${idx++}`);
      values.push(updates.reviewedAt);
    }

    fields.push(`updated_at = $${idx++}`);
    values.push(new Date().toISOString());

    values.push(id);
    const res = await this.query(
      `UPDATE kyc_verifications SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, user_id, companion_id, document_type, document_number_masked, status, provider_verification_id, rejection_reason, reviewer_admin_id, submitted_at, reviewed_at, created_at, updated_at`,
      values
    );

    return res.rows[0] ? this.mapKycVerification(res.rows[0]) : undefined;
  }

  // --- Demo / Seed Reset ---

  async reset(): Promise<void> {
    await this.ensureInitialized();
    await this.pool.query(
      `TRUNCATE TABLE
         webhook_events,
         kyc_verifications,
         audit_logs,
         notifications,
         payouts,
         payments,
         reports,
         reviews,
         booking_events,
         bookings,
         availability,
         experiences,
         companions,
         profiles,
         users
       CASCADE;`
    );
    await seedPostgres(this.pool);
  }
}
