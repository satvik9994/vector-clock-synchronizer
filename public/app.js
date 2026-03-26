// ═══════════════════════════════════════════════════════════════
//  Vector Clock Synchronizer – Frontend App
// ═══════════════════════════════════════════════════════════════

const API = '';  // same origin

const NODE_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa'];
const TYPE_ICONS = { internal: '⚙️', send: '📤', receive: '📥' };

let allEvents = [];

// ── DOM refs ───────────────────────────────────────────
const $timeline = document.getElementById('timeline');
const $loading = document.getElementById('timeline-loading');
const $empty = document.getElementById('timeline-empty');
const $statTotal = document.getElementById('stat-total');
const $statInternal = document.getElementById('stat-internal');
const $statSend = document.getElementById('stat-send');
const $statReceive = document.getElementById('stat-receive');
const $statConflict = document.getElementById('stat-conflicts');
const $cmpEvent1 = document.getElementById('cmp-event1');
const $cmpEvent2 = document.getElementById('cmp-event2');
const $cmpResult = document.getElementById('compare-result');
const $modal = document.getElementById('event-modal');
const $modalBody = document.getElementById('modal-body');

// ── Fetch events ───────────────────────────────────────
async function fetchEvents() {
    $loading.style.display = 'flex';
    $timeline.style.display = 'none';
    $empty.style.display = 'none';

    try {
        const res = await fetch(`${API}/events`);
        allEvents = await res.json();
    } catch {
        allEvents = [];
    }

    $loading.style.display = 'none';

    if (allEvents.length === 0) {
        $empty.style.display = 'flex';
    } else {
        $timeline.style.display = 'block';
        renderTimeline();
    }

    updateStats();
    populateSelectors();
}

// ── Stats ──────────────────────────────────────────────
function updateStats() {
    $statTotal.textContent = allEvents.length;
    $statInternal.textContent = allEvents.filter(e => e.eventType === 'internal').length;
    $statSend.textContent = allEvents.filter(e => e.eventType === 'send').length;
    $statReceive.textContent = allEvents.filter(e => e.eventType === 'receive').length;
    $statConflict.textContent = allEvents.filter(e => e.conflictStatus).length;
}

// ── Timeline ───────────────────────────────────────────
function renderTimeline() {
    // Group events by nodeId
    const nodes = {};
    allEvents.forEach(ev => {
        if (!nodes[ev.nodeId]) nodes[ev.nodeId] = [];
        nodes[ev.nodeId].push(ev);
    });

    const sortedNodeIds = Object.keys(nodes).sort((a, b) => +a - +b);

    let html = '<div class="timeline-grid">';

    sortedNodeIds.forEach(nodeId => {
        const color = NODE_COLORS[nodeId % NODE_COLORS.length];
        html += `
      <div class="node-lane">
        <div class="node-label">
          <span class="node-dot" style="background: ${color}"></span>
          Node ${nodeId}
        </div>
        <div class="lane-events">`;

        nodes[nodeId].forEach(ev => {
            const vc = `[${ev.vectorClock.join(',')}]`;
            const conflictClass = ev.conflictStatus ? 'conflict' : '';
            const typeClass = ev.eventType;

            html += `
          <div class="event-node ${typeClass} ${conflictClass}"
               data-id="${ev._id}"
               style="border-top: 2px solid ${color}"
               title="${ev.payload}">
            <span class="event-type-icon">${TYPE_ICONS[ev.eventType]}</span>
            <span class="event-vc">${vc}</span>
            <span class="event-label">${ev.eventType}</span>
          </div>`;
        });

        html += `
        </div>
      </div>`;
    });

    html += '</div>';
    $timeline.innerHTML = html;

    // Click handlers for detail modal
    $timeline.querySelectorAll('.event-node').forEach(el => {
        el.addEventListener('click', () => showEventDetail(el.dataset.id));
    });
}

// ── Event Detail Modal ─────────────────────────────────
function showEventDetail(eventId) {
    const ev = allEvents.find(e => e._id === eventId);
    if (!ev) return;

    const hlc = ev.hybridLogicalClock;
    const date = new Date(hlc.physicalTime).toLocaleString();

    $modalBody.innerHTML = `
    <h3>${TYPE_ICONS[ev.eventType]} Event Detail</h3>
    <table class="modal-table">
      <tr><th>ID</th><td>${ev._id}</td></tr>
      <tr><th>Node</th><td>Node ${ev.nodeId}</td></tr>
      <tr><th>Type</th><td>${ev.eventType}</td></tr>
      <tr><th>Payload</th><td style="font-family: var(--font-sans); color: var(--text-primary);">${ev.payload}</td></tr>
      <tr><th>Vector Clock</th><td style="color: var(--accent-purple);">[${ev.vectorClock.join(', ')}]</td></tr>
      <tr><th>HLC Physical</th><td>${hlc.physicalTime} <span style="color:var(--text-dim)">(${date})</span></td></tr>
      <tr><th>HLC Counter</th><td>${hlc.logicalCounter}</td></tr>
      <tr><th>Conflict</th><td style="color: ${ev.conflictStatus ? 'var(--accent-red)' : 'var(--accent-green)'};">${ev.conflictStatus ? '⚠️ Yes' : '✓ No'}</td></tr>
      ${ev.resolvedBy ? `<tr><th>Resolved By</th><td>${ev.resolvedBy}</td></tr>` : ''}
      ${ev.linkedEventId ? `<tr><th>Linked Event</th><td>${ev.linkedEventId}</td></tr>` : ''}
      <tr><th>Created</th><td>${new Date(ev.createdAt).toLocaleString()}</td></tr>
    </table>
  `;

    $modal.style.display = 'flex';
}

// Close modal
document.getElementById('modal-close').addEventListener('click', () => {
    $modal.style.display = 'none';
});
$modal.addEventListener('click', (e) => {
    if (e.target === $modal) $modal.style.display = 'none';
});

// ── Populate Select Dropdowns ──────────────────────────
function populateSelectors() {
    const opts = allEvents.map(ev => {
        const vc = `[${ev.vectorClock.join(',')}]`;
        return `<option value="${ev._id}">Node${ev.nodeId} ${ev.eventType} ${vc}</option>`;
    }).join('');

    const placeholder = '<option value="">Select event…</option>';
    $cmpEvent1.innerHTML = placeholder + opts;
    $cmpEvent2.innerHTML = placeholder + opts;
}

// ── Compare ────────────────────────────────────────────
document.getElementById('btn-compare').addEventListener('click', async () => {
    const id1 = $cmpEvent1.value;
    const id2 = $cmpEvent2.value;
    if (!id1 || !id2 || id1 === id2) {
        $cmpResult.style.display = 'block';
        $cmpResult.innerHTML = '<p style="color: var(--accent-yellow);">Please select two different events.</p>';
        return;
    }

    try {
        const res = await fetch(`${API}/events/compare/${id1}/${id2}`);
        const data = await res.json();

        const e1 = allEvents.find(e => e._id === id1);
        const e2 = allEvents.find(e => e._id === id2);

        let resolutionHTML = '';
        if (data.isConcurrent && data.resolution) {
            resolutionHTML = `
        <div class="resolution-banner">
          ⚡ <strong>Conflict Detected!</strong><br/>
          Winner: ${data.resolution.winnerId}<br/>
          Strategy: ${data.resolution.strategy}
        </div>`;
        }

        $cmpResult.innerHTML = `
      <div class="result-relation ${data.relation}">${data.relation.replace(/_/g, ' ')}</div>
      <div class="result-detail">
        <div class="result-event">
          <strong>Event 1</strong> — Node ${data.event1.nodeId}<br/>
          <span class="vc-label">[${data.event1.vectorClock.join(', ')}]</span>
        </div>
        <div class="result-event">
          <strong>Event 2</strong> — Node ${data.event2.nodeId}<br/>
          <span class="vc-label">[${data.event2.vectorClock.join(', ')}]</span>
        </div>
      </div>
      ${resolutionHTML}
    `;
        $cmpResult.style.display = 'block';

        // Refresh events to reflect conflict status updates
        fetchEvents();
    } catch (err) {
        $cmpResult.style.display = 'block';
        $cmpResult.innerHTML = `<p style="color: var(--accent-red);">Error: ${err.message}</p>`;
    }
});

// ── Simulate Button ────────────────────────────────────
document.getElementById('btn-simulate').addEventListener('click', async () => {
    const btn = document.getElementById('btn-simulate');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;margin:0;"></span> Running…';

    try {
        // Clear existing events
        await fetch(`${API}/events`, { method: 'DELETE' });

        const NUM_NODES = 3;

        // Helper
        async function post(path, body) {
            const r = await fetch(`${API}${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            return r.json();
        }

        function rand(max) { return Math.floor(Math.random() * max); }
        function randOther(id) { let t; do { t = rand(NUM_NODES); } while (t === id); return t; }

        // Phase 1: Initialize all nodes
        for (let n = 0; n < NUM_NODES; n++) {
            await post('/event/internal', { nodeId: n, payload: `Node ${n} initializes` });
        }

        // Phase 2: Random internal events
        for (let i = 0; i < 4; i++) {
            const n = rand(NUM_NODES);
            await post('/event/internal', { nodeId: n, payload: `Node ${n} local work #${i + 1}` });
        }

        // Phase 3: Send/receive pairs
        for (let i = 0; i < 4; i++) {
            const s = rand(NUM_NODES);
            const r = randOther(s);
            const sendEv = await post('/event/send', { nodeId: s, targetNodeId: r, payload: `Msg ${i + 1}: Node ${s} → ${r}` });
            await post('/event/receive', { nodeId: r, sendEventId: sendEv._id, payload: `Node ${r} recv msg ${i + 1}` });
        }

        // Phase 4: More independent events (to create concurrency)
        for (let i = 0; i < 5; i++) {
            const n = rand(NUM_NODES);
            await post('/event/internal', { nodeId: n, payload: `Node ${n} independent #${i + 1}` });
        }

        await fetchEvents();
    } catch (err) {
        console.error('Simulation error:', err);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Simulate`;
    }
});

// ── Refresh Button ─────────────────────────────────────
document.getElementById('btn-refresh').addEventListener('click', fetchEvents);

// ── Init ───────────────────────────────────────────────
fetchEvents();
