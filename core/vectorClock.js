// ═══════════════════════════════════════════════════════════════
//  Vector Clock Algorithm
//  Each node maintains an array of counters (one per node).
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new zero-initialized vector clock for `n` nodes.
 * @param {number} numNodes
 * @returns {number[]}
 */
function createClock(numNodes) {
    return new Array(numNodes).fill(0);
}

/**
 * Increment the clock entry for the given node (internal / send event).
 * Returns a NEW array (no mutation).
 * @param {number[]} clock
 * @param {number} nodeIndex
 * @returns {number[]}
 */
function incrementClock(clock, nodeIndex) {
    const updated = [...clock];
    updated[nodeIndex] += 1;
    return updated;
}

/**
 * Merge a remote clock into the local clock on RECEIVE.
 * Rule:  for each i → max(local[i], remote[i])
 *        then increment own index.
 * @param {number[]} localClock
 * @param {number[]} remoteClock
 * @param {number} nodeIndex  – index of the receiving node
 * @returns {number[]}
 */
function mergeClocksOnReceive(localClock, remoteClock, nodeIndex) {
    const merged = localClock.map((val, i) => Math.max(val, remoteClock[i]));
    merged[nodeIndex] += 1;
    return merged;
}

/**
 * Compare two vector clocks.
 *
 * Returns one of:
 *   "HAPPENS_BEFORE"  – v1 < v2   (v1 causally precedes v2)
 *   "HAPPENS_AFTER"   – v1 > v2   (v1 causally follows v2)
 *   "CONCURRENT"      – neither ≤ nor ≥
 *   "IDENTICAL"       – v1 === v2
 *
 * @param {number[]} v1
 * @param {number[]} v2
 * @returns {string}
 */
function compareVectors(v1, v2) {
    let v1LessOrEqual = true;   // every v1[i] <= v2[i]
    let v2LessOrEqual = true;   // every v2[i] <= v1[i]

    for (let i = 0; i < v1.length; i++) {
        if (v1[i] > v2[i]) v1LessOrEqual = false;
        if (v2[i] > v1[i]) v2LessOrEqual = false;
    }

    if (v1LessOrEqual && v2LessOrEqual) return 'IDENTICAL';
    if (v1LessOrEqual) return 'HAPPENS_BEFORE';
    if (v2LessOrEqual) return 'HAPPENS_AFTER';
    return 'CONCURRENT';
}

module.exports = {
    createClock,
    incrementClock,
    mergeClocksOnReceive,
    compareVectors,
};
