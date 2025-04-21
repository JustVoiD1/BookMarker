import { Timestamp } from "bson";
import mongoose from "mongoose";

const userSchema = mongoose.Schema({

    tgId: {
        type: String,
        unique: true,
        required: true,

    },

    firstName: {
        type: String,
        required: true,
    },

    lastName: {
        type: String,
        required: true,
    },

    isBot: {
        type: Boolean,
        required: true,
    },

    userName: {
        type: String,
        required: true,
    },

    promptTokens: {
        type: Number,
        required: false,
    },

    completionTokens: {
        type: Number,
        required: false,
    },


}, {timestamps: true})


export default mongoose.model('User', userSchema);