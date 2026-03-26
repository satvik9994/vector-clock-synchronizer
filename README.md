# Vector Clock Synchronizer

A distributed system simulation built with **Node.js, Express.js, and MongoDB** that demonstrates **Vector Clocks**, **Hybrid Logical Clocks (HLC)**, and **conflict detection** across multiple logical nodes.

- **Vector Clocks** to maintain event ordering
- **Hybrid Logical Clocks (HLC)** for consistent time tracking
---

## 📁 Folder Structure

```
vector-clock-synchronizer/
├── server.js              # Express entry point
├── .env                   # Environment config
├── config/
│   └── db.js              # MongoDB connection
├── models/
│   └── Event.js           # Mongoose Event schema
├── core/
│   ├── vectorClock.js     # Vector Clock algorithm
│   ├── hlc.js             # Hybrid Logical Clock
│   └── conflict.js        # Conflict detection & resolution
├── routes/
│   └── events.js          # REST API endpoints
├── simulation/
│   └── simulate.js        # Simulation script
└── public/
    ├── index.html          # Timeline visualization
    ├── style.css           # Styles (dark theme)
    └── app.js              # Client-side JS
```

---

## 🚀 Setup Instructions

### Prerequisites
- **Node.js** v18+ 
- **MongoDB** running locally on port `27017`

### Installation

```bash
cd vector-clock-synchronizer
npm install
```

### Start the Server

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

Server runs on `http://localhost:3000`.

### Run Simulation

```bash
# Start server first, then in another terminal:
npm run simulate
```

---

## 🔧 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/event/internal` | Create internal event `{ nodeId, payload }` |
| `POST` | `/event/send` | Send event `{ nodeId, targetNodeId, payload }` |
| `POST` | `/event/receive` | Receive event `{ nodeId, sendEventId, payload }` |
| `GET`  | `/events` | List all events (sorted by time) |
| `GET`  | `/events/compare/:id1/:id2` | Compare two events for causality |
| `DELETE` | `/events` | Clear all events and reset node state |

### Sample Request

```json
POST /event/internal
{
  "nodeId": 0,
  "payload": "Node 0 processes user request"
}
```

### Sample Response

```json
{
  "_id": "65a7f...",
  "nodeId": 0,
  "eventType": "internal",
  "payload": "Node 0 processes user request",
  "vectorClock": [1, 0, 0],
  "hybridLogicalClock": {
    "physicalTime": 1705500000000,
    "logicalCounter": 0,
    "nodeId": 0
  },
  "conflictStatus": false,
  "createdAt": "2025-01-17T..."
}
```

---

## 📖 Algorithm Explanations

### Vector Clock Logic

Each of the `N` nodes maintains a vector (array) of `N` counters:

```
Node 0: [0, 0, 0]
Node 1: [0, 0, 0]
Node 2: [0, 0, 0]
```

**Rules:**

| Event | Action |
|-------|--------|
| **Internal** | Increment own index: `VC[myId]++` |
| **Send** | Increment own index, attach VC to message |
| **Receive** | Element-wise `max(local, remote)`, then increment own index |

**Example:**
```
Node 0: internal  → [1, 0, 0]
Node 0: internal  → [2, 0, 0]
Node 0: send→1    → [3, 0, 0]  (attached to message)
Node 1: recv←0    → max([0,0,0], [3,0,0]) + inc = [3, 1, 0]
```

### Comparison (Causality Detection)

Given two vector clocks `V1` and `V2`:

| Condition | Relation |
|-----------|----------|
| `V1[i] ≤ V2[i]` for all `i`, and at least one `<` | **HAPPENS_BEFORE** (V1 → V2) |
| `V1[i] ≥ V2[i]` for all `i`, and at least one `>` | **HAPPENS_AFTER** (V2 → V1) |
| Neither ≤ nor ≥ | **CONCURRENT** (no causal relation) |
| All equal | **IDENTICAL** |

The `compareVectors(v1, v2)` function implements this logic.

---

### Hybrid Logical Clock (HLC)

HLC combines **physical wall-clock time** with a **logical counter** to create monotonically increasing timestamps that respect causality:

```
HLC = { physicalTime, logicalCounter, nodeId }
```

**Rules:**

| Event | Algorithm |
|-------|-----------|
| **Local** | `pt = max(hlc.pt, now)`; if same → `lc++`, else `lc = 0` |
| **Receive** | `pt = max(local.pt, remote.pt, now)`; merge counters accordingly |

**Clock Drift:** If `|local.pt - remote.pt| > 5000ms`, a drift warning is logged.

**Why HLC?** Pure vector clocks detect concurrency but can't resolve it. HLC provides a total ordering that respects causality when possible: used for **Last-Write-Wins** conflict resolution.

---

### Conflict Detection & Resolution

1. **Detect:** Two events are **concurrent** (conflicting) when `compareVectors(v1, v2) === "CONCURRENT"`.
2. **Resolve:** Use **Last-Write-Wins** based on HLC:
   - Compare `physicalTime` → higher wins
   - If tied → compare `logicalCounter`
   - If still tied → compare `nodeId` (deterministic tiebreaker)

---

## 📊 Sample Test Data

After running `npm run simulate`, you'll see output like:

```
Node 0  ⚙️ internal  VC=[1, 0, 0]    HLC=(PT:1705500000 LC:0)
Node 1  ⚙️ internal  VC=[0, 1, 0]    HLC=(PT:1705500001 LC:0)
Node 2  ⚙️ internal  VC=[0, 0, 1]    HLC=(PT:1705500002 LC:0)
Node 0  📤 send      VC=[2, 0, 0]    HLC=(PT:1705500003 LC:0)
Node 1  📥 receive   VC=[2, 2, 0]    HLC=(PT:1705500004 LC:0)

Compare: Node0 [2,0,0] vs Node2 [0,0,3]  →  CONCURRENT
         ⚡ CONFLICT detected! Winner: ... (Last-Write-Wins)
```

---

## 🖥️ Frontend Visualization

Open `http://localhost:3000` after starting the server. The UI provides:

- **Swimlane timeline** — one row per node showing events chronologically
- **Vector clock labels** on each event card
- **Conflict highlighting** (red border on concurrent events)
- **Event detail modal** — click any event to see full metadata
- **Causality comparison** — select two events to compare their vector clocks
- **In-browser simulate** button to generate events without the CLI

---

## License

MIT
