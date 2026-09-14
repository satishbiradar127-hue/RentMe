import { IDatabaseStore, MemoryStore } from './memoryStore';
import { PostgresStore } from './postgresStore';

let storeInstance: IDatabaseStore | null = null;
let envLoaded = false;

function loadEnvOnce(): void {
  if (!envLoaded && typeof process.loadEnvFile === 'function') {
    envLoaded = true;
    try {
      process.loadEnvFile();
    } catch {}
  }
}

// Load .env once at module initialization
loadEnvOnce();

export function getDatabase(): IDatabaseStore {
  if (!storeInstance) {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (databaseUrl) {
      storeInstance = new PostgresStore(databaseUrl);
    } else {
      storeInstance = new MemoryStore();
    }
  }
  return storeInstance;
}

export function setDatabase(store: IDatabaseStore | null): void {
  storeInstance = store;
}

export async function closeDatabase(): Promise<void> {
  if (storeInstance && 'close' in storeInstance && typeof (storeInstance as any).close === 'function') {
    await (storeInstance as any).close();
  }
  storeInstance = null;
}

export async function initDatabase(): Promise<IDatabaseStore> {
  const store = getDatabase();
  if (store instanceof PostgresStore) {
    try {
      console.log('[Database] Connecting to PostgreSQL repository via DATABASE_URL...');
      await store.ensureInitialized();
      console.log('[Database] PostgreSQL repository connected, schema verified, and ready.');
    } catch (err: any) {
      console.error('[Database] Failed to connect to PostgreSQL repository:', err.message);
      throw err;
    }
  } else {
    console.log('[Database] In-memory store active (DATABASE_URL not configured).');
  }
  return store;
}

export * from './memoryStore';
export * from './postgresStore';
export * from './schemaRunner';
export * from './seed';
export * from './seedData';
