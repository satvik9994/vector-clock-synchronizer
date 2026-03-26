
const express = require('express');
const router = express.Router();

const EventModel = require('../models/Event');
const {
    initializeVectorClock,
    advanceVectorClock,
    synchronizeVectorClocks,
    compareClockVectors,
} = require('../core/vectorClock');
const { initializeHybridClock, advanceHybridClock, synchronizeHybridClocks } = require('../core/hlc');
const { identifyConcurrency, handleConcurrency } = require('../core/conflict');

// In-memory storage for node states
const TOTAL_NODES = parseInt(process.env.NUM_NODES, 10) || 3;

const vectorClocks = {}; // Maps nodeId to its vector clock
const hybridClocks = {}; // Maps nodeId to its hybrid logical clock

function initializeNodeState(nodeId) {
    if (!vectorClocks[nodeId]) {
        vectorClocks[nodeId] = initializeVectorClock(TOTAL_NODES);
        hybridClocks[nodeId] = initializeHybridClock(nodeId);
    }
}

// Endpoint for internal events
router.post('/event/internal', async (req, res) => {
    try {
        const { nodeId, payload } = req.body;

        if (nodeId == null || nodeId < 0 || nodeId >= TOTAL_NODES) {
            return res.status(400).json({ error: `nodeId must be between 0 and ${TOTAL_NODES - 1}` });
        }

        initializeNodeState(nodeId);

        // Advance the clocks for this node
        vectorClocks[nodeId] = advanceVectorClock(vectorClocks[nodeId], nodeId);
        hybridClocks[nodeId] = advanceHybridClock(hybridClocks[nodeId]);

        const newEvent = await EventModel.create({
            nodeId,
            eventType: 'internal',
            payload: payload || `Internal event at Node ${nodeId}`,
            vectorClock: vectorClocks[nodeId],
            hybridLogicalClock: hybridClocks[nodeId],
        });

        res.status(201).json(newEvent);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Endpoint for sending events
router.post('/event/send', async (req, res) => {
    try {
        const { nodeId, targetNodeId, payload } = req.body;

        if (nodeId == null || nodeId < 0 || nodeId >= TOTAL_NODES) {
            return res.status(400).json({ error: `nodeId must be between 0 and ${TOTAL_NODES - 1}` });
        }
        if (targetNodeId == null || targetNodeId < 0 || targetNodeId >= TOTAL_NODES) {
            return res.status(400).json({ error: `targetNodeId must be between 0 and ${TOTAL_NODES - 1}` });
        }

        initializeNodeState(nodeId);

        // Advance the sender's clocks
        vectorClocks[nodeId] = advanceVectorClock(vectorClocks[nodeId], nodeId);
        hybridClocks[nodeId] = advanceHybridClock(hybridClocks[nodeId]);

        const newEvent = await EventModel.create({
            nodeId,
            eventType: 'send',
            payload: payload || `Message from Node ${nodeId} to Node ${targetNodeId}`,
            vectorClock: vectorClocks[nodeId],
            hybridLogicalClock: hybridClocks[nodeId],
        });

        res.status(201).json(newEvent);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Endpoint for receiving events
router.post('/event/receive', async (req, res) => {
    try {
        const { nodeId, sendEventId, payload } = req.body;

        if (nodeId == null || nodeId < 0 || nodeId >= TOTAL_NODES) {
            return res.status(400).json({ error: `nodeId must be between 0 and ${TOTAL_NODES - 1}` });
        }

        // Retrieve the sending event for clock synchronization
        const sendingEvent = await EventModel.findById(sendEventId);
        if (!sendingEvent || sendingEvent.eventType !== 'send') {
            return res.status(400).json({ error: 'sendEventId must point to a valid send event' });
        }

        initializeNodeState(nodeId);

        // Synchronize vector clocks
        vectorClocks[nodeId] = synchronizeVectorClocks(
            vectorClocks[nodeId],
            sendingEvent.vectorClock,
            nodeId
        );

        // Synchronize hybrid clocks
        const { hlc: updatedHLC } = synchronizeHybridClocks(hybridClocks[nodeId], sendingEvent.hybridLogicalClock);
        hybridClocks[nodeId] = updatedHLC;

        const newEvent = await EventModel.create({
            nodeId,
            eventType: 'receive',
            payload: payload || `Node ${nodeId} received message from Node ${sendingEvent.nodeId}`,
            vectorClock: vectorClocks[nodeId],
            hybridLogicalClock: hybridClocks[nodeId],
            linkedEventId: sendingEvent._id,
        });

        res.status(201).json(newEvent);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Retrieve all events
router.get('/events', async (_req, res) => {
    try {
        const allEvents = await EventModel.find().sort({ createdAt: 1 });
        res.json(allEvents);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Compare two events
router.get('/events/compare/:id1/:id2', async (req, res) => {
    try {
        const [firstEvent, secondEvent] = await Promise.all([
            EventModel.findById(req.params.id1),
            EventModel.findById(req.params.id2),
        ]);

        if (!firstEvent || !secondEvent) {
            return res.status(404).json({ error: 'One or both events could not be found' });
        }

        const clockComparison = compareClockVectors(firstEvent.vectorClock, secondEvent.vectorClock);
        const hasConcurrency = identifyConcurrency(firstEvent.vectorClock, secondEvent.vectorClock);

        let conflictResolution = null;
        if (hasConcurrency) {
            conflictResolution = handleConcurrency(firstEvent, secondEvent);
            conflictResolution = {
                winnerId: conflictResolution.winner._id,
                loserId: conflictResolution.loser._id,
                strategy: conflictResolution.strategy,
            };

            // Update conflict status in database
            await EventModel.updateMany(
                { _id: { $in: [firstEvent._id, secondEvent._id] } },
                { conflictStatus: true, resolvedBy: 'Last-Write-Wins (HLC)' }
            );
        }

        res.json({
            event1: { id: firstEvent._id, nodeId: firstEvent.nodeId, vectorClock: firstEvent.vectorClock },
            event2: { id: secondEvent._id, nodeId: secondEvent.nodeId, vectorClock: secondEvent.vectorClock },
            relation: clockComparison,
            isConcurrent: hasConcurrency,
            resolution: conflictResolution,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Clear all events and reset states
router.delete('/events', async (_req, res) => {
    try {
        await EventModel.deleteMany({});
        // Clear in-memory states
        Object.keys(vectorClocks).forEach(key => delete vectorClocks[key]);
        Object.keys(hybridClocks).forEach(key => delete hybridClocks[key]);
        res.json({ message: 'All events removed and node states reset' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;