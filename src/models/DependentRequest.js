import mongoose from "mongoose";

const dependentRequestSchema = new mongoose.Schema({
  dependentUserId: { type: String, required: true, unique: true },
  leaderPhoneNumber: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending' 
  },
}, { timestamps: true });

export default mongoose.model("DependentRequest", dependentRequestSchema);