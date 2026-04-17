#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  Simulation Script
//  Generates random distributed events across nodes via the API
//  and then compares random event pairs to show concurrency.
// ═══════════════════════════════════════════════════════════════

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const NUM_NODES = parseInt(process.env.NUM_NODES, 10) || 3;

// ── Helpers ────────────────────────────────────────────
async function api(method, path, body) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE_URL}${path}`, opts);
    return res.json();
}

function randomNode() {
    return Math.floor(Math.random() * NUM_NODES);
}

function randomOtherNode(nodeId) {
    let target;
    do { target = randomNode(); } while (target === nodeId);
    return target;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// ── Pretty Logging ─────────────────────────────────────
const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    magenta: '\x1b[35m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    white: '\x1b[37m',
};

const NODE_COLORS = [COLORS.cyan, COLORS.green, COLORS.yellow];

function logEvent(event) {
    const nc = NODE_COLORS[event.nodeId % NODE_COLORS.length];
    const typeIcon =
        event.eventType === 'internal' ? '⚙️ ' :
            event.eventType === 'send' ? '📤' :
                '📥';

    const vc = `[${event.vectorClock.join(', ')}]`;
    const hlc = `PT:${event.hybridLogicalClock.physicalTime} LC:${event.hybridLogicalClock.logicalCounter}`;

    console.log(
        `  ${nc}Node ${event.nodeId}${COLORS.reset}  ${typeIcon} ${COLORS.bright}${event.eventType.padEnd(8)}${COLORS.reset}  ` +
        `VC=${COLORS.magenta}${vc.padEnd(14)}${COLORS.reset}  HLC=(${COLORS.dim}${hlc}${COLORS.reset})  ` +
        `${COLORS.dim}${event.payload}${COLORS.reset}`
    );
}

// ── Main Simulation ────────────────────────────────────
async function main() {
    console.log(`\n${COLORS.bright}╔════════════════════════════════════════════════════╗${COLORS.reset}`);
    console.log(`${COLORS.bright}║     Vector Clock Synchronizer – Simulation         ║${COLORS.reset}`);
    console.log(`${COLORS.bright}╚════════════════════════════════════════════════════╝${COLORS.reset}\n`);
    console.log(`  Nodes  : ${NUM_NODES}`);
    console.log(`  Server : ${BASE_URL}\n`);

    // Reset previous data
    console.log(`${COLORS.dim}  Clearing previous events...${COLORS.reset}`);
    await api('DELETE', '/events');
    await sleep(200);

    console.log(`\n${COLORS.bright}── Phase 1: Generating Events ──────────────────────${COLORS.reset}\n`);

    const allEvents = [];

    // Step 1 – A few internal events on each node
    for (let n = 0; n < NUM_NODES; n++) {
        const ev = await api('POST', '/event/internal', {
            nodeId: n,
            payload: `Node ${n} initializes`,
        });
        logEvent(ev);
        allEvents.push(ev);
        await sleep(80);
    }

    // Step 2 – More internal events
    for (let i = 0; i < 4; i++) {
        const n = randomNode();
        const ev = await api('POST', '/event/internal', {
            nodeId: n,
            payload: `Node ${n} local work #${i + 1}`,
        });
        logEvent(ev);
        allEvents.push(ev);
        await sleep(80);
    }

    // Step 3 – Send / Receive pairs
    console.log(`\n${COLORS.bright}── Phase 2: Message Passing ────────────────────────${COLORS.reset}\n`);

    for (let i = 0; i < 4; i++) {
        const sender = randomNode();
        const receiver = randomOtherNode(sender);

        // Send
        const sendEv = await api('POST', '/event/send', {
            nodeId: sender,
            targetNodeId: receiver,
            payload: `Message ${i + 1}: Node ${sender} → Node ${receiver}`,
        });
        logEvent(sendEv);
        allEvents.push(sendEv);
        await sleep(80);

        // Receive
        const recvEv = await api('POST', '/event/receive', {
            nodeId: receiver,
            sendEventId: sendEv._id,
            payload: `Node ${receiver} received msg ${i + 1} from Node ${sender}`,
        });
        logEvent(recvEv);
        allEvents.push(recvEv);
        await sleep(80);
    }

    // Step 4 – More internal events (to create concurrent events)
    console.log(`\n${COLORS.bright}── Phase 3: Concurrent Internal Events ─────────────${COLORS.reset}\n`);

    for (let i = 0; i < 5; i++) {
        const n = randomNode();
        const ev = await api('POST', '/event/internal', {
            nodeId: n,
            payload: `Node ${n} independent work #${i + 1}`,
        });
        logEvent(ev);
        allEvents.push(ev);
        await sleep(50);
    }

    // ── Phase 4: Compare random pairs ──────────────────
    console.log(`\n${COLORS.bright}── Phase 4: Causality & Concurrency Detection ─────${COLORS.reset}\n`);

    const comparisons = [];
    const pairsToCompare = 6;

    for (let i = 0; i < pairsToCompare; i++) {
        const idx1 = Math.floor(Math.random() * allEvents.length);
        let idx2;
        do { idx2 = Math.floor(Math.random() * allEvents.length); } while (idx2 === idx1);

        const e1 = allEvents[idx1];
        const e2 = allEvents[idx2];

        const result = await api('GET', `/events/compare/${e1._id}/${e2._id}`);
        comparisons.push(result);

        const relationColor =
            result.relation === 'CONCURRENT' ? COLORS.red :
                result.relation === 'HAPPENS_BEFORE' ? COLORS.green :
                    result.relation === 'HAPPENS_AFTER' ? COLORS.blue :
                        COLORS.dim;

        const e1vc = `[${result.event1.vectorClock.join(',')}]`;
        const e2vc = `[${result.event2.vectorClock.join(',')}]`;

        console.log(
            `  ${COLORS.dim}Compare:${COLORS.reset} ` +
            `Node${result.event1.nodeId} ${COLORS.magenta}${e1vc}${COLORS.reset}` +
            ` vs ` +
            `Node${result.event2.nodeId} ${COLORS.magenta}${e2vc}${COLORS.reset}` +
            `  →  ${relationColor}${COLORS.bright}${result.relation}${COLORS.reset}`
        );

        if (result.isConcurrent && result.resolution) {
            console.log(
                `         ${COLORS.yellow}⚡ CONFLICT detected! Winner: ${result.resolution.winnerId} (${result.resolution.strategy})${COLORS.reset}`
            );
        }
    }

    // ── Summary ────────────────────────────────────────
    const concurrentCount = comparisons.filter((c) => c.isConcurrent).length;
    const causalCount = comparisons.filter(
        (c) => c.relation === 'HAPPENS_BEFORE' || c.relation === 'HAPPENS_AFTER'
    ).length;

    console.log(`\n${COLORS.bright}── Summary ─────────────────────────────────────────${COLORS.reset}\n`);
    console.log(`  Total events generated : ${allEvents.length}`);
    console.log(`  Comparisons made       : ${comparisons.length}`);
    console.log(`  ${COLORS.green}Causal relations found   : ${causalCount}${COLORS.reset}`);
    console.log(`  ${COLORS.red}Concurrent (conflicts)   : ${concurrentCount}${COLORS.reset}`);
    console.log(`\n  ${COLORS.dim}View full timeline at: ${BASE_URL}${COLORS.reset}\n`);
    console.log(`${COLORS.cyan}Insight: Vector clocks help determine causal relationships and detect concurrent conflicts in distributed systems.${COLORS.reset}`);
}

main().catch((err) => {
    console.error('Simulation error:', err);
    process.exit(1);
});
