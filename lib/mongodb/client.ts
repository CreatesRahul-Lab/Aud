import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI ?? process.env.MONGO_URI ?? "";

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

export async function getMongoClient(): Promise<MongoClient> {
  if (!uri) {
    throw new Error("Missing MongoDB connection string. Set MONGODB_URI (or MONGO_URI).");
  }

  if (client) {
    return client;
  }

  if (!clientPromise) {
    clientPromise = new MongoClient(uri, {
      // Let the MongoDB driver negotiate TLS for Atlas.
      // For Vercel/serverless this avoids handshake issues caused by overly strict custom TLS flags.
      family: 4,
      minPoolSize: 0,
      maxPoolSize: 10,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 10000,
    }).connect();
  }

  client = await clientPromise;
  return client;
}

export async function getDb(): Promise<Db> {
  const mongoClient = await getMongoClient();
  return mongoClient.db();
}
