import mongoose from 'mongoose';

/**
 * Inicia a conexão com o banco de dados MongoDB.
 * Esta função é assíncrona e retorna uma Promise que o server.js pode "esperar".
 */
export async function connectToDatabase() {
  try {
    // Await garante que a função só termina após a conexão ser bem-sucedida.
    // Como a função é 'async', ela automaticamente retorna uma Promise.
    await mongoose.connect(process.env.MONGODB_URI);

  } catch (error) {
    // Se a conexão falhar, este erro será capturado pelo .catch() no server.js.
    console.error("❌ Falha na conexão com o MongoDB:", error.message);
    throw error;
  }
}

/**
 * Retorna a instância da conexão do Mongoose que já foi estabelecida.
 * Necessário para o rate-limiter.
 */
export function getMongooseConnection() {
  return mongoose.connection;
}