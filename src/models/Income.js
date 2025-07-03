import mongoose from "mongoose";
import { INCOME_CATEGORIES } from '../utils/categories.js';

const incomeSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  // CAMPO CHAVE: Este é o valor LÍQUIDO que o motorista recebe.
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  category: {
    type: String,
    required: true,
    enum: INCOME_CATEGORIES
  },
  // De qual plataforma veio o ganho?
  source: {
    type: String,
    required: true,
    enum: ['Uber', '99', 'InDrive', 'Outros'],
    default: 'Outros'
  },
  // CAMPO OPCIONAL: Taxa do aplicativo, caso o motorista informe.
  // Não é usado para calcular o 'amount'.
  tax: {
    type: Number,
    required: false
  },
  // CAMPO OPCIONAL: Distância da corrida em KM, para análises futuras de R$/KM.
  distance: {
    type: Number,
    required: true
  },
  date: { type: Date, default: Date.now },
  messageId: String,
});

export default mongoose.model("Income", incomeSchema);