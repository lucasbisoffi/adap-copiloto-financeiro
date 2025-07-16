import mongoose from "mongoose";
import { ALL_REMINDER_TYPES } from '../utils/categories.js';

const reminderSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true 
    },
    description: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    type: {
        type: String,
        required: true,
        enum: ALL_REMINDER_TYPES,
        default: 'Outro'
    },
    messageId: {
        type: String,
        required: true,
        unique: true
    },
});

export default mongoose.model("Reminder", reminderSchema);