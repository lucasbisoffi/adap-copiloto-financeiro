import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import UserStats from '../src/models/UserStats.js';
import Income from '../src/models/Income.js';
import Expense from '../src/models/Expense.js';
import { connectToDatabase } from '../src/config/database.js';

const migrate = async () => {
  console.log('Iniciando migração de dados para a estrutura de múltiplos perfis...');
  
  await connectToDatabase(); // Conecta ao banco de dados

  // 1. Migrar Usuários existentes para o perfil 'driver'
  const userUpdateResult = await UserStats.updateMany(
    { 'profiles.driver': { $ne: true } }, // Apenas usuários não migrados
    {
      $set: {
        'profiles.driver': true,
        'profiles.motoboy': false,
        'activeProfile': 'driver'
      }
    }
  );
  console.log(`[Usuários]: ${userUpdateResult.modifiedCount} registros migrados.`);

  // 2. Migrar Ganhos existentes para o perfil 'driver'
  const incomeUpdateResult = await Income.updateMany(
    { profileType: { $exists: false } },
    { $set: { profileType: 'driver' } }
  );
  console.log(`[Ganhos]: ${incomeUpdateResult.modifiedCount} registros migrados.`);

  // 3. Migrar Gastos existentes para o perfil 'driver'
  const expenseUpdateResult = await Expense.updateMany(
    { profileType: { $exists: false } },
    { $set: { profileType: 'driver' } }
  );
  console.log(`[Gastos]: ${expenseUpdateResult.modifiedCount} registros migrados.`);

  console.log('Migração concluída com sucesso!');
  mongoose.connection.close();
};

migrate().catch(err => {
  console.error('ERRO DURANTE A MIGRAÇÃO:', err);
  mongoose.connection.close();
});