import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI ?? process.env.MONGO_URI ?? "";

if (!uri) {
  throw new Error("Missing MongoDB connection string. Set MONGODB_URI (or MONGO_URI).");
}

// ---------------------------------------------------------------------------
// Global caching — Vercel recommended pattern for serverless MongoDB.
// Prevents creating a new connection on every cold-start invocation.
// ---------------------------------------------------------------------------
declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function createClientPromise(): Promise<MongoClient> {
  // ⚠️  Do NOT set tls:true explicitly — mongodb+srv:// enables TLS
  // automatically and the explicit flag triggers SSL alert 80 on Vercel's
  // Node 18+ OpenSSL build when it resolves an IPv6 Atlas endpoint.
  const client = new MongoClient(uri, {
    // Force IPv4 so we never accidentally connect via IPv6 (which Atlas
    // rejects with the SSL internal_error / alert-80 TLS handshake failure).
    family: 4,
    // Serverless-friendly pool sizes
    minPoolSize: 0,
    maxPoolSize: 5,
    maxIdleTimeMS: 30_000,
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
    retryWrites: true,
  });
  return client.connect();
}

// In development we attach to a global to survive HMR reloads.
// In production each cold start gets a fresh promise (one per instance).
const clientPromise: Promise<MongoClient> =
  process.env.NODE_ENV === "development"
    ? (globalThis._mongoClientPromise ??= createClientPromise())
    : createClientPromise();

export async function getMongoClient(): Promise<MongoClient> {
  return clientPromise;
}

export async function getDb(name?: string): Promise<Db> {
  const client = await clientPromise;
  return client.db(name);
}
