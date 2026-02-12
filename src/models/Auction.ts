import mongoose from 'mongoose';

const BidSchema = new mongoose.Schema({
    id: { type: String, required: true },
    auctionId: { type: String, required: true },
    bidderAddress: { type: String, required: true },
    amount: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'detected', 'confirmed'], default: 'detected' },
    txHash: { type: String, required: true }
});

const AuctionSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String },
    imageUrl: { type: String },
    seller: {
        address: { type: String, required: true }
    },
    startPrice: { type: Number, required: true },
    currentPrice: { type: Number, required: true },
    minimumIncrement: { type: Number, required: true },
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date, required: true },
    status: { type: String, enum: ['live', 'ended'], default: 'live' },
    bids: [BidSchema],
    bidCount: { type: Number, default: 0 },
    highestBidder: {
        address: { type: String }
    }
}, { timestamps: true });

export const Auction = mongoose.model('Auction', AuctionSchema);
