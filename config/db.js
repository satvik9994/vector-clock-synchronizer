const mongoose = require('mongoose');

let mongoServer; // holds the in-memory server reference (if used)

const connectDB = async () => {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        console.error('❌ MONGODB_URI is not set in .env file');
        console.log('   Please add your MongoDB Atlas connection string to .env');
        console.log('   Example: MONGODB_URI=mongodb+srv://<user>:<password>@cluster.xxxxx.mongodb.net/vector_clock_db');
        process.exit(1);
    }

    try {
        await mongoose.connect(uri);
        console.log(`✅ MongoDB Connected: ${mongoose.connection.host}`);
        console.log(`   Database: ${mongoose.connection.name}`);
    } catch (err) {
        // Fallback: spin up an in-memory MongoDB server
        console.warn(`⚠️  Could not connect to MongoDB Atlas — ${err.message}`);
        console.warn('   Falling back to in-memory MongoDB…');

        const { MongoMemoryServer } = require('mongodb-memory-server');
        mongoServer = await MongoMemoryServer.create();
        const memUri = mongoServer.getUri();

        await mongoose.connect(memUri);
        console.log(`✅ In-Memory MongoDB Connected: ${memUri}`);
        console.log('   ⚠️  Data will NOT persist across server restarts.\n');
    }
};

module.exports = connectDB;