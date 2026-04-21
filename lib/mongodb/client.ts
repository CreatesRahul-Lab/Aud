import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI ?? "";

if (!uri) {
  throw new Error("MONGODB_URI is required");
}

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

export async function getMongoClient(): Promise<MongoClient> {
  if (client) {
    return client;
  }

  if (!clientPromise) {
    clientPromise = new MongoClient(uri).connect();
  }

  client = await clientPromise;
  return client;
}

export async function getDb(): Promise<Db> {
  const mongoClient = await getMongoClient();
  return mongoClient.db();
}
