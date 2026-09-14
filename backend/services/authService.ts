import { IncomingMessage } from 'http';
import { getDatabase, PostgresStore } from '../db/database';
import { User, UserRole } from '../models';

export interface AuthSession {
  user: User;
  role: UserRole;
  token: string;
  refreshToken?: string;
  isDevFallback?: boolean;
}

export interface AuthResult {
  authenticated: boolean;
  user?: User;
  role?: UserRole;
  token?: string;
  error?: string;
  isDevFallback?: boolean;
}

interface TokenCacheEntry {
  authUser: { id: string; email: string; user_metadata?: Record<string, any> };
  cachedAt: number;
}

// In-memory active session for local MVP and test fallback
let activeUserId: string = 'user-rohan';

export class AuthService {
  private get db() {
    return getDatabase();
  }

  private get supabaseUrl(): string {
    return process.env.SUPABASE_URL?.trim() || 'https://wdwioszopvegipszywey.supabase.co';
  }

  private get supabaseAnonKey(): string {
    return (
      process.env.SUPABASE_ANON_KEY?.trim() ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indkd2lvc3pvcHZlZ2lwc3p5d2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxODIxODEsImV4cCI6MjEwNDc1ODE4MX0.toCGMEt02mVPxxtSarO1OGITAoKJm5oq2Wz6wH14gfM'
    );
  }

  private tokenCache: Map<string, TokenCacheEntry> = new Map();

  public async verifySupabaseToken(
    token: string
  ): Promise<{ id: string; email: string; user_metadata?: Record<string, any> } | null> {
    if (!token || typeof token !== 'string') return null;

    const cached = this.tokenCache.get(token);
    if (cached && Date.now() - cached.cachedAt < 60_000) {
      return cached.authUser;
    }

    try {
      const res = await fetch(`${this.supabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: this.supabaseAnonKey,
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        this.tokenCache.delete(token);
        return null;
      }

      const data: any = await res.json();
      if (!data || !data.id || !data.email) return null;

      const authUser = {
        id: data.id,
        email: data.email,
        user_metadata: data.user_metadata || {}
      };

      this.tokenCache.set(token, { authUser, cachedAt: Date.now() });
      return authUser;
    } catch (err: any) {
      console.error('[AuthService] Token verification network failure:', err.message);
      return null;
    }
  }

  public async resolveUserFromAuth(authUser: {
    id: string;
    email: string;
    user_metadata?: Record<string, any>;
  }): Promise<{ user: User; role: UserRole } | null> {
    const email = authUser.email.toLowerCase().trim();

    // 1. Try resolving by authId
    let user = await this.db.getUserByAuthId(authUser.id);

    // 2. Try resolving by email
    if (!user) {
      user = await this.db.getUserByEmail(email);
      if (user) {
        // Link auth_id
        user.authId = authUser.id;
        await this.db.createUser(user);
      }
    }

    // 3. If user doesn't exist yet in public.users, create new user record
    if (!user) {
      const rawRole = authUser.user_metadata?.role;
      const assignedRole: UserRole = rawRole === 'companion' ? 'companion' : 'customer';
      const name = authUser.user_metadata?.name || email.split('@')[0];
      const newUserId = `user-${authUser.id.substring(0, 8)}`;

      const now = new Date().toISOString();
      user = await this.db.createUser({
        id: newUserId,
        email,
        role: assignedRole,
        name,
        phone: authUser.user_metadata?.phone || undefined,
        authId: authUser.id,
        createdAt: now,
        updatedAt: now
      });

      await this.db.upsertProfile({
        id: `profile-${authUser.id.substring(0, 8)}`,
        userId: user.id,
        displayName: name,
        city: 'Hyderabad, Telangana',
        idVerified: false,
        verificationStatus: 'unverified',
        createdAt: now,
        updatedAt: now
      });

      if (assignedRole === 'companion') {
        const companionId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await this.db.upsertCompanion({
          id: companionId,
          userId: user.id,
          name,
          city: 'Hyderabad, Telangana',
          category: 'Culture & Heritage',
          rate: 2000,
          rating: 5.0,
          reviews: 0,
          response: '15 min',
          status: 'ID Verified',
          image: 'assets/companion-aisha.svg',
          specialties: ['Hyderabad Local Experiences'],
          bio: 'Verified local Hyderabad companion.',
          createdAt: now,
          updatedAt: now
        });
      }
    }

    return {
      user,
      role: user.role // Database record is authoritative!
    };
  }

  public async loginWithPassword(email: string, password: string): Promise<AuthSession> {
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    const cleanEmail = email.toLowerCase().trim();

    const res = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: this.supabaseAnonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: cleanEmail, password })
    });

    const data: any = await res.json();
    if (!res.ok || !data.access_token) {
      throw new Error(data.error_description || data.msg || 'Invalid email or password');
    }

    const resolved = await this.resolveUserFromAuth({
      id: data.user.id,
      email: data.user.email,
      user_metadata: data.user.user_metadata
    });

    if (!resolved) {
      throw new Error('Failed to resolve user account from database');
    }

    return {
      user: resolved.user,
      role: resolved.role,
      token: data.access_token,
      refreshToken: data.refresh_token
    };
  }

  public isProductionMode(req?: IncomingMessage): boolean {
    if (req && (req.headers['x-simulate-env'] === 'production' || req.headers['x-rentme-env'] === 'production')) {
      return true;
    }
    return process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_FALLBACK !== 'true';
  }

  public async refreshToken(refreshToken: string, req?: IncomingMessage): Promise<AuthSession> {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new Error('Refresh token is required');
    }

    if (refreshToken.startsWith('mock_refresh_token_') || refreshToken.startsWith('mock_')) {
      if (this.isProductionMode(req)) {
        throw new Error('Mock refresh tokens are disabled in production');
      }
      const targetId = refreshToken.replace('mock_refresh_token_', '').replace('mock_', '');
      const user = (await this.db.getUserById(targetId)) || (await this.db.getUsers())[0];
      if (!user) throw new Error('User not found for refresh token');
      return {
        user,
        role: user.role,
        token: `mock_session_token_${user.id}`,
        refreshToken: `mock_refresh_token_${user.id}`,
        isDevFallback: true
      };
    }

    try {
      const res = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          apikey: this.supabaseAnonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refresh_token: refreshToken })
      });

      const data: any = await res.json();
      if (!res.ok || !data.access_token) {
        throw new Error(data.error_description || data.msg || 'Failed to refresh token');
      }

      const resolved = await this.resolveUserFromAuth({
        id: data.user.id,
        email: data.user.email,
        user_metadata: data.user.user_metadata
      });

      if (!resolved) {
        throw new Error('Failed to resolve user account from database');
      }

      this.tokenCache.set(data.access_token, {
        authUser: { id: data.user.id, email: data.user.email, user_metadata: data.user.user_metadata },
        cachedAt: Date.now()
      });

      return {
        user: resolved.user,
        role: resolved.role,
        token: data.access_token,
        refreshToken: data.refresh_token
      };
    } catch (err: any) {
      throw new Error(`Token refresh failed: ${err.message}`);
    }
  }

  public async signup(params: {
    email: string;
    password: string;
    name: string;
    role?: UserRole;
    phone?: string;
  }): Promise<AuthSession> {
    const email = params.email.toLowerCase().trim();
    const password = params.password;
    const name = params.name.trim();
    const role: UserRole = params.role === 'companion' ? 'companion' : 'customer';

    if (!email || !password || !name) {
      throw new Error('Name, email, and password are required');
    }
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    // If PostgresStore is active, register user via DB atomic helper
    if (this.db instanceof PostgresStore) {
      const pg = this.db as PostgresStore;
      try {
        await pg.query('SELECT public.register_rentme_user($1, $2, $3, $4, $5)', [
          email,
          password,
          name,
          role,
          params.phone || null
        ]);
      } catch (dbErr: any) {
        throw new Error(`Signup registration failed: ${dbErr.message}`);
      }
    } else {
      // Fallback for in-memory testing
      const existing = await this.db.getUserByEmail(email);
      if (existing) {
        throw new Error(`User with email ${email} already exists`);
      }
      const newUserId = `user-${Date.now().toString(36)}`;
      const now = new Date().toISOString();
      await this.db.createUser({
        id: newUserId,
        email,
        role,
        name,
        phone: params.phone,
        authId: `auth-${newUserId}`,
        createdAt: now,
        updatedAt: now
      });
    }

    // Log in to obtain the real Supabase JWT
    return this.loginWithPassword(email, password).catch(async () => {
      // In memory test or offline fallback
      const u = (await this.db.getUserByEmail(email)) || {
        id: `user-${Date.now().toString(36)}`,
        email,
        role,
        name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      return {
        user: u,
        role: u.role,
        token: `supabase_token_${u.id}`
      };
    });
  }

  public async authenticateRequest(req: IncomingMessage): Promise<AuthResult> {
    const authHeader = req.headers['authorization'];

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();

      // 1. Check for dev fallback token in test/dev environment
      if (token.startsWith('mock_session_token_') || token.startsWith('dev_token_')) {
        if (this.isProductionMode(req)) {
          return { authenticated: false, error: 'Mock session tokens are disabled in production mode' };
        }
        const targetId = token.replace('mock_session_token_', '').replace('dev_token_', '') || activeUserId;
        const user = await this.db.getUserById(targetId);
        if (user) {
          return {
            authenticated: true,
            user,
            role: user.role,
            token,
            isDevFallback: true
          };
        }
        return { authenticated: false, error: 'Invalid mock session token' };
      }

      // 2. Real Supabase token verification
      const authUser = await this.verifySupabaseToken(token);
      if (!authUser) {
        return { authenticated: false, error: 'Invalid or expired authentication token' };
      }

      const resolved = await this.resolveUserFromAuth(authUser);
      if (!resolved) {
        return { authenticated: false, error: 'User record not found in RentMe database' };
      }

      return {
        authenticated: true,
        user: resolved.user,
        role: resolved.role,
        token
      };
    }

    // 3. In production mode, unauthenticated requests are strictly rejected
    if (this.isProductionMode(req)) {
      return {
        authenticated: false,
        error: 'Authentication required'
      };
    }

    // 4. Fallback for development and existing test suite when no Authorization header is provided
    const devSession = await this.getCurrentSession();
    return {
      authenticated: true,
      user: devSession.user,
      role: devSession.role,
      token: devSession.token,
      isDevFallback: true
    };
  }

  // Existing methods for test compatibility and dev fallback
  async getCurrentSession(overrideUserId?: string): Promise<AuthSession> {
    const targetId = overrideUserId || activeUserId;
    let user = await this.db.getUserById(targetId);
    if (!user) {
      const users = await this.db.getUsers();
      user = users[0];
      if (user) activeUserId = user.id;
    }

    return {
      user: user || {
        id: 'user-rohan',
        email: 'rohan@example.com',
        name: 'Rohan Mehta',
        role: 'customer',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      role: user ? user.role : 'customer',
      token: `mock_session_token_${user?.id || 'user-rohan'}`,
      isDevFallback: true
    };
  }

  async switchSession(role: UserRole, specificUserId?: string): Promise<AuthSession> {
    if (this.isProductionMode()) {
      throw new Error('Persona switching is disabled in production environments.');
    }

    const users = await this.db.getUsers();
    let targetUser: User | undefined;

    if (specificUserId) {
      targetUser = users.find((u) => u.id === specificUserId);
    }

    if (!targetUser) {
      targetUser = users.find((u) => u.role === role);
    }

    if (!targetUser) {
      throw new Error(`No user found for role: ${role}`);
    }

    activeUserId = targetUser.id;
    return {
      user: targetUser,
      role: targetUser.role,
      token: `mock_session_token_${targetUser.id}`,
      isDevFallback: true
    };
  }

  async listAvailablePersonas(): Promise<Array<{ id: string; name: string; email: string; role: UserRole }>> {
    const users = await this.db.getUsers();
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role
    }));
  }

  validateRole(requiredRoles: UserRole[], userRole: UserRole): boolean {
    return requiredRoles.includes(userRole);
  }
}
