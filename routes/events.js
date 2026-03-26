
const express = require('express');
const router = express.Router();

const Event = require('../models/Event');
const {
    createClock,
    incrementClock,
    mergeClocksOnReceive,
    compareVectors,
} = require('../core/vectorClock');
const { createHLC, tickHLC, receiveHLC } = require('../core/hlc');
const { detectConflict, resolveConflict } = require('../core/conflict');

// ── In-memory node state ───────────────────────────────
const NUM_NODES = parseInt(process.env.NUM_NODES, 10) || 3;

const nodeClocks = {};   // nodeId → vector clock array
const nodeHLCs = {};     // nodeId → HLC object

function ensureNode(nodeId) {
    if (!nodeClocks[nodeId]) {
        nodeClocks[nodeId] = createClock(NUM_NODES);
        nodeHLCs[nodeId] = createHLC(nodeId);
    }
}

// ── POST /event/internal ──────────────────────────────
router.post('/event/internal', async (req, res) => {
    try {
        const { nodeId, payload } = req.body;

        if (nodeId == null || nodeId < 0 || nodeId >= NUM_NODES) {
            return res.status(400).json({ error: `nodeId must be 0..${NUM_NODES - 1}` });
        }

        ensureNode(nodeId);

        // Update clocks
        nodeClocks[nodeId] = incrementClock(nodeClocks[nodeId], nodeId);
        nodeHLCs[nodeId] = tickHLC(nodeHLCs[nodeId]);

        const event = await Event.create({
            nodeId,
            eventType: 'internal',
            payload: payload || `Internal event on Node ${nodeId}`,
            vectorClock: nodeClocks[nodeId],
            hybridLogicalClock: nodeHLCs[nodeId],
        });

        res.status(201).json(event);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /event/send ──────────────────────────────────
router.post('/event/send', async (req, res) => {
    try {
        const { nodeId, targetNodeId, payload } = req.body;

        if (nodeId == null || nodeId < 0 || nodeId >= NUM_NODES) {
            return res.status(400).json({ error: `nodeId must be 0..${NUM_NODES - 1}` });
        }
        if (targetNodeId == null || targetNodeId < 0 || targetNodeId >= NUM_NODES) {
            return res.status(400).json({ error: `targetNodeId must be 0..${NUM_NODES - 1}` });
        }

        ensureNode(nodeId);

        // Increment sender's clock
        nodeClocks[nodeId] = incrementClock(nodeClocks[nodeId], nodeId);
        nodeHLCs[nodeId] = tickHLC(nodeHLCs[nodeId]);

        const event = await Event.create({
            nodeId,
            eventType: 'send',
            payload: payload || `Node ${nodeId} → Node ${targetNodeId}`,
            vectorClock: nodeClocks[nodeId],
            hybridLogicalClock: nodeHLCs[nodeId],
        });

        res.status(201).json(event);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /event/receive ───────────────────────────────
router.post('/event/receive', async (req, res) => {
    try {
        const { nodeId, sendEventId, payload } = req.body;

        if (nodeId == null || nodeId < 0 || nodeId >= NUM_NODES) {
            return res.status(400).json({ error: `nodeId must be 0..${NUM_NODES - 1}` });
        }

        // Fetch the original send event to get its vector clock & HLC
        const sendEvent = await Event.findById(sendEventId);
        if (!sendEvent || sendEvent.eventType !== 'send') {
            return res.status(400).json({ error: 'Invalid sendEventId – must reference a send event' });
        }

        ensureNode(nodeId);

        // Merge vector clocks
        nodeClocks[nodeId] = mergeClocksOnReceive(
            nodeClocks[nodeId],
            sendEvent.vectorClock,
            nodeId
        );

        // Merge HLCs
        const { hlc } = receiveHLC(nodeHLCs[nodeId], sendEvent.hybridLogicalClock);
        nodeHLCs[nodeId] = hlc;

        const event = await Event.create({
            nodeId,
            eventType: 'receive',
            payload: payload || `Node ${nodeId} received from Node ${sendEvent.nodeId}`,
            vectorClock: nodeClocks[nodeId],
            hybridLogicalClock: nodeHLCs[nodeId],
            linkedEventId: sendEvent._id,
        });

        res.status(201).json(event);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /events ───────────────────────────────────────
router.get('/events', async (_req, res) => {
    try {
        const events = await Event.find().sort({ createdAt: 1 });
        res.json(events);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /events/compare/:id1/:id2 ────────────────────
router.get('/events/compare/:id1/:id2', async (req, res) => {
    try {
        const [e1, e2] = await Promise.all([
            Event.findById(req.params.id1),
            Event.findById(req.params.id2),
        ]);

        if (!e1 || !e2) {
            return res.status(404).json({ error: 'One or both events not found' });
        }

        const relation = compareVectors(e1.vectorClock, e2.vectorClock);
        const isConcurrent = detectConflict(e1.vectorClock, e2.vectorClock);

        let resolution = null;
        if (isConcurrent) {
            resolution = resolveConflict(e1, e2);
            resolution = {
                winnerId: resolution.winner._id,
                loserId: resolution.loser._id,
                strategy: resolution.strategy,
            };

            // Mark both events as conflicted in DB
            await Event.updateMany(
                { _id: { $in: [e1._id, e2._id] } },
                { conflictStatus: true, resolvedBy: 'Last-Write-Wins (HLC)' }
            );
        }

        res.json({
            event1: { id: e1._id, nodeId: e1.nodeId, vectorClock: e1.vectorClock },
            event2: { id: e2._id, nodeId: e2.nodeId, vectorClock: e2.vectorClock },
            relation,
            isConcurrent,
            resolution,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── DELETE /events (utility – reset) ──────────────────
router.delete('/events', async (_req, res) => {
    try {
        await Event.deleteMany({});
        // Reset in-memory state
        Object.keys(nodeClocks).forEach((k) => delete nodeClocks[k]);
        Object.keys(nodeHLCs).forEach((k) => delete nodeHLCs[k]);
        res.json({ message: 'All events cleared and node states reset' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
//routes