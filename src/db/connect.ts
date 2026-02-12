import mongoose from 'mongoose';

const connectDB = async (url: string) => {
    try {
        await mongoose.connect(url);
        console.log('[Database] Connected to MongoDB');
    } catch (error) {
        console.error('[Database] Connection failed:', error);
        process.exit(1);
    }
};

export default connectDB;
