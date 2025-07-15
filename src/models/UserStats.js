// src/models/UserStats.js

import mongoose from "mongoose";

const userStatsSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },

    profiles: {
        driver: { type: Boolean, default: false },
        courier: { type: Boolean, default: false }
    },
    activeProfile: {
        type: String,
        enum: ['driver', 'motoboy'],
    },
    
    welcomedToV2: { type: Boolean, default: false },

    activeVehicleId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Vehicle'
    },
    activeMotorcycleId: {
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Motorcycle'
    },
    
    blocked: { type: Boolean, default: false },
    totalSpent: { type: Number, default: 0 },
    totalIncome: { type: Number, default: 0 },
    featuresUnlocked: {
        type: [String],
        default: [],
    },
}, { timestamps: true }); // Adiciona createdAt e updatedAt automaticamente

export default mongoose.model("UserStats", userStatsSchema);