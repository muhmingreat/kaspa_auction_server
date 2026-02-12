import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import { auctionEngine } from './engine';
import { kaspaService } from './kaspa';
import connectDB from './db/connect';

dotenv.config();

const app = express();
const httpServer = createServer(app);
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const io = new Server(httpServer, {
    cors: {
        origin: [
            process.env.CORS_ORIGIN || "https://kaspa-auction.vercel.app",
            "http://localhost:3000",
        ],
        methods: ["GET", "POST"]
    },
    transports: ['websocket']
});

// Map to keep track of active monitors per auction
const activeMonitors = new Map<string, () => void>();

/**
 * Starts monitoring an auction's receiving address
 */
const monitorAuction = async (auctionId: string) => {
    const auction = await auctionEngine.getAuction(auctionId);
    if (!auction || auction.status === 'ended') return;

    // Use the seller address as the receiving address for now 
    // (In a real app, each auction would have a unique address)
    const receivingAddress = auction.seller.address;

    if (activeMonitors.has(auctionId)) return;

    console.log(`[Monitor] Starting monitor for Auction ${auctionId} at ${receivingAddress}`);

    const stopMonitor = kaspaService.monitorAddress(receivingAddress, async (txData) => {
        const validatedBid = await auctionEngine.processOnChainBid(auctionId, txData);
        if (validatedBid) {
            console.log(`[Monitor] Valid bid detected and processed for Auction ${auctionId}`);
            io.emit('new_bid', { auctionId, bid: validatedBid });

            // Fetch fresh state to emit
            const updatedAuction = await auctionEngine.getAuction(auctionId);
            io.emit('auction_updated', updatedAuction);
        }
    });

    activeMonitors.set(auctionId, stopMonitor);
};

// Initial monitoring for all live auctions
const startMonitoring = async () => {
    const auctions = await auctionEngine.getAllAuctions();
    auctions.forEach(a => {
        if (a.status === 'live') {
            monitorAuction(a.id);
        }
    });
};

// WebSocket logic
io.on('connection', async (socket) => {
    console.log(`[Socket] User connected: ${socket.id}`);

    // Send initial state
    const auctions = await auctionEngine.getAllAuctions();
    socket.emit('all_auctions', auctions);

    socket.on('request_auctions', async () => {
        const updatedAuctions = await auctionEngine.getAllAuctions();
        socket.emit('all_auctions', updatedAuctions);
    });

    socket.on('disconnect', () => {
        console.log(`[Socket] User disconnected: ${socket.id}`);
    });
});

// API Routes
app.get('/api/auctions', async (req: Request, res: Response) => {
    const auctions = await auctionEngine.getAllAuctions();
    res.json(auctions);
});

app.post('/api/auctions', async (req: Request, res: Response) => {
    const { title, description, imageUrl, startPrice, duration, category, sellerAddress } = req.body;

    const newAuction = {
        id: Math.random().toString(36).substr(2, 9),
        title,
        description,
        imageUrl,
        seller: {
            address: sellerAddress || 'kaspa:qpm2qsrpvvqzps7x27de69v907atvuvm6gyt86pvl2', // Fallback for testing
        },
        startPrice: Number(startPrice),
        currentPrice: Number(startPrice),
        minimumIncrement: Math.max(10, Math.floor(Number(startPrice) * 0.05)), // 5% min increment
        startTime: new Date(),
        endTime: new Date(Date.now() + duration * 3600000),
        status: 'live' as const,
        bids: [],
        bidCount: 0
    };

    await auctionEngine.createAuction(newAuction);
    monitorAuction(newAuction.id); // Start monitoring the new auction immediately

    const allAuctions = await auctionEngine.getAllAuctions();
    io.emit('all_auctions', allAuctions); // Notify all clients

    res.json({ success: true, auction: newAuction });
});


app.get('/api/auctions/:id', async (req: Request, res: Response) => {
    const auction = await auctionEngine.getAuction(req.params.id);
    if (auction) {
        res.json(auction);
    } else {
        res.status(404).json({ error: 'Auction not found' });
    }
});

app.delete('/api/auctions/:id', async (req: Request, res: Response) => {
    const auctionId = req.params.id;
    const { sellerAddress } = req.body; // In a real app, this would be from auth/session

    const auction = await auctionEngine.getAuction(auctionId);
    if (!auction) {
        res.status(404).json({ error: 'Auction not found' });
        return;
    }

    if (auction.seller.address !== sellerAddress) {
        res.status(403).json({ error: 'Unauthorized: Only the creator can delete this auction.' });
        return;
    }

    // Engine handles bid check (status 400 if bids exist or other failure)
    const success = await auctionEngine.deleteAuction(auctionId);
    if (success) {
        const allAuctions = await auctionEngine.getAllAuctions();
        io.emit('all_auctions', allAuctions);
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'Cannot delete auction. It may have active bids.' });
    }
});

/**
 * Endpoint for "manual" bid simulation (for testing)
 * In production, this would be triggered by a Kaspa Node WebSocket listener
 */
app.post('/api/test/simulate-bid', async (req: Request, res: Response) => {
    const { auctionId, amount, sender } = req.body;

    const txData = {
        hash: 'test_tx_' + Math.random().toString(36).substr(2, 9),
        amount: Number(amount),
        sender: sender || 'test-bidder',
        timestamp: Date.now()
    };

    const validatedBid = await auctionEngine.processOnChainBid(auctionId, txData);

    if (validatedBid) {
        io.emit('new_bid', { auctionId, bid: validatedBid });
        const updatedAuction = await auctionEngine.getAuction(auctionId);
        io.emit('auction_updated', updatedAuction);
        res.json({ success: true, bid: validatedBid });
    } else {
        res.status(400).json({ success: false, error: 'Bid rejected by engine rules' });
    }
});

const PORT = process.env.PORT || 3500;
const MONGO_URI = process.env.MONGODB_URI;

const startServer = async () => {
    if (MONGO_URI) {
        await connectDB(MONGO_URI);
    } else {
        console.warn('[Database] MONGODB_URI not found in .env. Persistence disabled (errors will occur).');
    }

    // Start background tasks
    startMonitoring();

    httpServer.listen(PORT, () => {
        console.log(`[Server] Auction Engine running on port ${PORT}`);
    });
};

startServer();
