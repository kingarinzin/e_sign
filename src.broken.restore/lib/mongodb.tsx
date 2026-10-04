import { MongoClient, ServerApiVersion } from "mongodb";

const uri = process.env.MONGODB_URI!;
let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (!process.env.MONGODB_URI) {
  throw new Error("Please add your MongoDB URI to .env.local");
}

// MongoDB connection options with better timeout and retry settings
const options = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

if (process.env.NODE_ENV === "development") {
  // Avoid multiple connections in development
  if (!(global as any)._mongoClientPromise) {
    client = new MongoClient(uri, options);
    (global as any)._mongoClientPromise = client.connect();
  }
  clientPromise = (global as any)._mongoClientPromise;
} else {
  // Production
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export async function connectToDatabase() {
  try {
    const client = await clientPromise;
    const db = client.db();
    
    // Test the connection
    await db.admin().ping();
    console.log("✅ MongoDB connected successfully");
    
    return { client, db };
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error);
    throw error;
  }
}

export default clientPromise;
