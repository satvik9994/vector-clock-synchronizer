require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const connectDB = require('./config/db');
const eventRoutes = require('./routes/events');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));


app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ─────────────────────────────────────────
app.use('/', eventRoutes);

// ── Root redirect ──────────────────────────────────────
app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ──────────────────────────────────────────────
const startServer = async () => {
    try {
        await connectDB();
    } catch (err) {
        console.warn(` MongoDB not available and server will start without DB. Error: ${err.message}`);
    }
    app.listen(PORT, () => {
        console.log(`\n Vector Clock Synchronizer running on http://localhost:${PORT}`);
        console.log(`   Nodes configured: ${process.env.NUM_NODES || 3}\n`);
    });
};

startServer();

module.exports = app;
