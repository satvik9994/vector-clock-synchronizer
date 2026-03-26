const mongoose = require('mongoose');

let mongoServer; // holds the in-memory server reference (if used)

const connectDB = async () => {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/vector_clock_db';

    try {
        // Try connecting to the configured MongoDB URI first
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
        console.log(`✅ MongoDB Connected: ${mongoose.connection.host}`);
    } catch (_err) {
        // Fallback: spin up an in-memory MongoDB server
        console.warn('⚠️  Local MongoDB not available — starting in-memory MongoDB…');

        const { MongoMemoryServer } = require('mongodb-memory-server');
        mongoServer = await MongoMemoryServer.create();
        const memUri = mongoServer.getUri();

        await mongoose.connect(memUri);
        console.log(`✅ In-Memory MongoDB Connected: ${memUri}`);
        console.log('   ⚠️  Data will NOT persist across server restarts.\n');
    }
};

module.exports = connectDB;
