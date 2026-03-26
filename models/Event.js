const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
    {
        nodeId: {
            type: Number,
            required: true,
            min: 0,
        },
        eventType: {
            type: String,
            required: true,
            enum: ['internal', 'send', 'receive'],
        },
        payload: {
            type: String,
            default: '',
        },
        vectorClock: {
            type: [Number],
            required: true,
        },
        hybridLogicalClock: {
            physicalTime: { type: Number, required: true },
            logicalCounter: { type: Number, required: true },
            nodeId: { type: Number, required: true },
        },
        linkedEventId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Event',
            default: null,
        },
        conflictStatus: {
            type: Boolean,
            default: false,
        },
        resolvedBy: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: { createdAt: 'createdAt', updatedAt: false },
    }
);

// Index for fast queries
eventSchema.index({ nodeId: 1, createdAt: 1 });

module.exports = mongoose.model('Event', eventSchema);
