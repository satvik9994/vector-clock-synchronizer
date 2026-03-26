// ═══════════════════════════════════════════════════════════════
//  Conflict Detection & Resolution
// ═══════════════════════════════════════════════════════════════

const { compareVectors } = require('./vectorClock');
const { compareHLC } = require('./hlc');

/**
 * Detect whether two events are concurrent (i.e., conflicting).
 * Two events conflict when neither happens-before the other.
 *
 * @param {number[]} v1  – vector clock of event 1
 * @param {number[]} v2  – vector clock of event 2
 * @returns {boolean}      true if concurrent / conflicting
 */
function detectConflict(v1, v2) {
    return compareVectors(v1, v2) === 'CONCURRENT';
}

/**
 * Resolve a conflict between two concurrent events using
 * Last-Write-Wins with the Hybrid Logical Clock.
 *
 * @param {object} event1  – Mongoose event document (or plain object)
 * @param {object} event2  – Mongoose event document (or plain object)
 * @returns {{ winner: object, loser: object, strategy: string }}
 */
function resolveConflict(event1, event2) {
    const cmp = compareHLC(event1.hybridLogicalClock, event2.hybridLogicalClock);

    if (cmp >= 0) {
        return { winner: event1, loser: event2, strategy: 'Last-Write-Wins (HLC)' };
    }
    return { winner: event2, loser: event1, strategy: 'Last-Write-Wins (HLC)' };
}

module.exports = {
    detectConflict,
    resolveConflict,
};
