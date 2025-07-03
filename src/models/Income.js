import mongoose from "mongoose";
import { INCOME_CATEGORIES } from '../utils/categories.js';

const incomeSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  category: {
    type: String,
    required: true,
    enum: INCOME_CATEGORIES
  },
  // CAMPO CHAVE: De qual plataforma veio o ganho?
  source: {
    type: String,
    required: true,
    default: 'Outros', // Um valor padrão
    enum: ['Uber', '99', 'InDrive', 'Outros'] // Podemos adicionar mais plataformas
  },
  // CAMPOS ADICIONADOS PARA ANÁLISE DE RENTABILIDADE
  tax: { 
    type: Number, 
    required: false // Taxa cobrada pelo aplicativo
  },
  distance: {
    type: Number,
    required: false // Distância da corrida em KM
  },
  date: { type: Date, default: Date.now },
  messageId: String,
});

export default mongoose.model("Income", incomeSchema);