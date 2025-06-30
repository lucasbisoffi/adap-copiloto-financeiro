import mongoose from 'mongoose';

export async function connectToDatabase() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

  } catch (error) {
    console.error("❌ Falha na conexão com o MongoDB:", error.message);
    throw error;
  }
}

export function getMongooseConnection() {
  return mongoose.connection;
}