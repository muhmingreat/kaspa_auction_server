"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const engine_1 = require("./engine");
const mock_data_1 = require("./mock-data"); // We'll create this
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: "*", // In production, restrict this to the frontend URL
        methods: ["GET", "POST"]
    }
});
// Load mock data for demonstration
mock_data_1.mockAuctions.forEach(a => engine_1.auctionEngine.createAuction(a));
// WebSocket logic
io.on('connection', (socket) => {
    console.log(`[Socket] User connected: ${socket.id}`);
    // Send initial state
    socket.emit('all_auctions', engine_1.auctionEngine.getAllAuctions());
    socket.on('disconnect', () => {
        console.log(`[Socket] User disconnected: ${socket.id}`);
    });
});
// API Routes
app.get('/api/auctions', (req, res) => {
    res.json(engine_1.auctionEngine.getAllAuctions());
});
app.post('/api/auctions', (req, res) => {
    const { title, description, imageUrl, startPrice, duration, category } = req.body;
    const newAuction = {
        id: Math.random().toString(36).substr(2, 9),
        title,
        description,
        imageUrl,
        seller: {
            address: 'kaspa:qpm2qsrpvvqzps7x27de69v907atvuvm6gyt86pvl2', // Mock seller for demo
        },
        startPrice: Number(startPrice),
        currentPrice: Number(startPrice),
        minimumIncrement: Math.max(10, Math.floor(Number(startPrice) * 0.05)), // 5% min increment
        startTime: new Date(),
        endTime: new Date(Date.now() + duration * 3600000),
        status: 'live',
        bids: [],
        bidCount: 0
    };
    engine_1.auctionEngine.createAuction(newAuction);
    io.emit('all_auctions', engine_1.auctionEngine.getAllAuctions()); // Notify all clients
    res.json({ success: true, auction: newAuction });
});
app.get('/api/auctions/:id', (req, res) => {
    const auction = engine_1.auctionEngine.getAuction(req.params.id);
    if (auction) {
        res.json(auction);
    }
    else {
        res.status(404).json({ error: 'Auction not found' });
    }
});
/**
 * Endpoint for "manual" bid simulation (for testing)
 * In production, this would be triggered by a Kaspa Node WebSocket listener
 */
app.post('/api/test/simulate-bid', async (req, res) => {
    const { auctionId, amount, sender } = req.body;
    const txData = {
        hash: 'test_tx_' + Math.random().toString(36).substr(2, 9),
        amount: Number(amount),
        sender: sender || 'test-bidder',
        timestamp: Date.now()
    };
    const validatedBid = await engine_1.auctionEngine.processOnChainBid(auctionId, txData);
    if (validatedBid) {
        io.emit('new_bid', { auctionId, bid: validatedBid });
        io.emit('auction_updated', engine_1.auctionEngine.getAuction(auctionId));
        res.json({ success: true, bid: validatedBid });
    }
    else {
        res.status(400).json({ success: false, error: 'Bid rejected by engine rules' });
    }
});
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`[Server] Auction Engine running on port ${PORT}`);
});
