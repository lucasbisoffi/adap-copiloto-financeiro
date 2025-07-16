import mongoose from "mongoose";
import { ALL_EXPENSE_CATEGORIES } from '../utils/categories.js';
// O "ADAP: motoristas" possui categorias pré-definidas para os motoristas

const expenseSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  category: { type: String, required: true, enum: ALL_EXPENSE_CATEGORIES },
  // CAMPO ADICIONADO
  profileType: {
    type: String,
    enum: ['driver', 'motoboy'],
    required: true,
    index: true
  },
  
  date: { type: Date, default: Date.now },
  messageId: String,
});

export default mongoose.model("Expense", expenseSchema);