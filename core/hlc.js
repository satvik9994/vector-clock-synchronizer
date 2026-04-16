// ═══════════════════════════════════════════════════════════════
//  Hybrid Logical Clock  (HLC)
//  Combines physical wall-clock time with a logical counter
//  to give monotonically increasing timestamps even under drift.
// ═══════════════════════════════════════════════════════════════

const MAX_DRIFT_MS = 5000; // 5-second maximum tolerated clock drift

/**
 * Create a fresh HLC for a node.
 * @param {number} nodeId
 * @returns {{ physicalTime: number, logicalCounter: number, nodeId: number }}
 */
function createHLC(nodeId) {
    return {
        physicalTime: Date.now(),
        logicalCounter: 0,
        nodeId,
    };
}

/**
 * Tick the HLC on a LOCAL event (internal or send).
 *
 * Algorithm:
 *   pt' = max(hlc.physicalTime, Date.now())
 *   if pt' === hlc.physicalTime  → logicalCounter++
 *   else                         → logicalCounter = 0
 *   hlc.physicalTime = pt'
 *
 * @param {{ physicalTime: number, logicalCounter: number, nodeId: number }} hlc
 * @returns {{ physicalTime: number, logicalCounter: number, nodeId: number }}
 */
function tickHLC(hlc) {
    const now = Date.now();
    const prevPT = hlc.physicalTime;
    const newPT = Math.max(prevPT, now);

    return {
        physicalTime: newPT,
        logicalCounter: newPT === prevPT ? hlc.logicalCounter + 1 : 0,
        nodeId: hlc.nodeId,
    };
}

/**
 * Update the HLC on a RECEIVE event using the remote HLC.
 *
 * Algorithm:
 *   pt' = max(local.pt, remote.pt, now)
 *   if pt' === local.pt === remote.pt → lc = max(local.lc, remote.lc) + 1
 *   else if pt' === local.pt          → lc = local.lc + 1
 *   else if pt' === remote.pt         → lc = remote.lc + 1
 *   else                              → lc = 0
 *
 * Also checks for clock drift exceeding the threshold.
 *
 * @param {{ physicalTime: number, logicalCounter: number, nodeId: number }} local
 * @param {{ physicalTime: number, logicalCounter: number, nodeId: number }} remote
 * @returns {{ hlc: object, driftDetected: boolean }}
 */
function receiveHLC(local, remote) {
    const now = Date.now();
    const newPT = Math.max(local.physicalTime, remote.physicalTime, now);

    let lc;
    if (newPT === local.physicalTime && newPT === remote.physicalTime) {
        lc = Math.max(local.logicalCounter, remote.logicalCounter) + 1;
    } else if (newPT === local.physicalTime) {
        lc = local.logicalCounter + 1;
    } else if (newPT === remote.physicalTime) {
        lc = remote.logicalCounter + 1;
    } else {
        lc = 0;
    }

    const drift = Math.abs(local.physicalTime - remote.physicalTime);
    const driftDetected = drift > MAX_DRIFT_MS;

    if (driftDetected) {
        console.warn(
            `⚠️  Clock drift detected: ${drift}ms between node ${local.nodeId} and node ${remote.nodeId}`
        );
    }

    return {
        hlc: { physicalTime: newPT, logicalCounter: lc, nodeId: local.nodeId },
        driftDetected,
    };
}

/**
 * Compare two HLCs for ordering (used in Last-Write-Wins).
 * Returns  -1  if h1 < h2
 *           1  if h1 > h2
 *           0  if equal
 * @param {object} h1
 * @param {object} h2
 * @returns {number}
 */
function compareHLC(h1, h2) {
    if (h1.physicalTime !== h2.physicalTime) {
        return h1.physicalTime < h2.physicalTime ? -1 : 1;
    }
    if (h1.logicalCounter !== h2.logicalCounter) {
        return h1.logicalCounter < h2.logicalCounter ? -1 : 1;
    }
    if (h1.nodeId !== h2.nodeId) {
        return h1.nodeId < h2.nodeId ? -1 : 1;
    }
    return 0;
}

module.exports = {
    createHLC,
    tickHLC,
    receiveHLC,
    compareHLC,
    MAX_DRIFT_MS,
    initializeHybridClock: createHLC,
    advanceHybridClock: tickHLC,
    synchronizeHybridClocks: receiveHLC,
};
