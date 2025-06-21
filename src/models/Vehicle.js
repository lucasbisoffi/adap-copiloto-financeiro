import mongoose from "mongoose";

const vehicleSchema = new mongoose.Schema({
  // Link para o usuário dono do veículo. Essencial.
  userId: { type: String, required: true, index: true },

  // Informações básicas do veículo.
  brand: { type: String, required: true }, // Ex: "Fiat"
  model: { type: String, required: true }, // Ex: "Argo"
  year: { type: Number, required: true },  // Ex: 2022
  
  // Placa é opcional, mas útil para identificação única.
  licensePlate: { type: String, trim: true, uppercase: true },

  // A métrica mais importante para lembretes de manutenção.
  initialMileage: { type: Number, required: true }, // KM no momento do cadastro
  currentMileage: { type: Number, required: true }, // Será atualizado com o tempo

  // Para o caso do usuário trocar de carro.
  isActive: { type: Boolean, default: true, index: true },
  
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Vehicle", vehicleSchema);