import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI ?? process.env.MONGO_URI ?? "";
const allowInvalidCertificates = process.env.MONGODB_TLS_ALLOW_INVALID_CERTS === "true";
const allowInvalidHostnames = process.env.MONGODB_TLS_ALLOW_INVALID_HOSTNAMES === "true";

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

function getMongoLabel(): string {
  try {
    const parsed = new URL(uri);
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  } catch {
    return "invalid-uri";
  }
}

export async function getMongoClient(): Promise<MongoClient> {
  if (!uri) {
    throw new Error("Missing MongoDB connection string. Set MONGODB_URI (or MONGO_URI).");
  }

  if (client) {
    return client;
  }

  if (!clientPromise) {
    const mongoClient = new MongoClient(uri, {
      tls: true,
      tlsAllowInvalidCertificates: allowInvalidCertificates,
      tlsAllowInvalidHostnames: allowInvalidHostnames,
      family: 4,
      minPoolSize: 0,
      maxPoolSize: 10,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      retryWrites: true,
    });

    clientPromise = mongoClient.connect().catch((error) => {
      console.error("Mongo connect failed", {
        target: getMongoLabel(),
        nodeEnv: process.env.NODE_ENV,
        vercelRegion: process.env.VERCEL_REGION,
        tlsAllowInvalidCertificates: allowInvalidCertificates,
        tlsAllowInvalidHostnames: allowInvalidHostnames,
      });
      throw error;
    });
  }

  client = await clientPromise;
  return client;
}

export async function getDb(): Promise<Db> {
  const mongoClient = await getMongoClient();
  return mongoClient.db();
}
