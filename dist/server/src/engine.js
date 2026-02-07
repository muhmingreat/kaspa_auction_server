"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auctionEngine = exports.AuctionEngine = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const kaspa_1 = require("./kaspa");
const DATA_PATH = path_1.default.join(__dirname, '../data/auctions.json');
class AuctionEngine {
    auctions = new Map();
    constructor() {
        this.loadState();
    }
    loadState() {
        try {
            if (fs_1.default.existsSync(DATA_PATH)) {
                const data = fs_1.default.readFileSync(DATA_PATH, 'utf-8');
                const parsed = JSON.parse(data);
                Object.entries(parsed).forEach(([id, auction]) => {
                    this.auctions.set(id, auction);
                });
                console.log(`[AuctionEngine] Loaded ${this.auctions.size} auctions from disk.`);
            }
        }
        catch (error) {
            console.error('[AuctionEngine] Failed to load state:', error);
        }
    }
    saveState() {
        try {
            const dir = path_1.default.dirname(DATA_PATH);
            if (!fs_1.default.existsSync(dir)) {
                fs_1.default.mkdirSync(dir, { recursive: true });
            }
            const data = JSON.stringify(Object.fromEntries(this.auctions), null, 2);
            fs_1.default.writeFileSync(DATA_PATH, data);
        }
        catch (error) {
            console.error('[AuctionEngine] Failed to save state:', error);
        }
    }
    /**
     * Creates a new auction in the engine
     */
    createAuction(auction) {
        this.auctions.set(auction.id, {
            ...auction,
            status: auction.status || 'live',
            bids: auction.bids || [],
            bidCount: auction.bidCount || 0
        });
        this.saveState();
        console.log(`[AuctionEngine] Created auction: ${auction.id}`);
    }
    /**
     * Processes an incoming UTXO change from the Kaspa network.
     */
    async processOnChainBid(auctionId, txData) {
        const auction = this.auctions.get(auctionId);
        if (!auction)
            return null;
        // RULE 0: Re-verify cryptographic proof from the network
        const txOnChain = await kaspa_1.kaspaService.verifyTransaction(txData.hash);
        if (txOnChain && txOnChain.amount !== txData.amount) {
            console.error(`[AuctionEngine] Amount mismatch! On-chain: ${txOnChain.amount}, Reported: ${txData.amount}`);
            return null;
        }
        // RULE 1: Auction must be live
        if (auction.status === 'ended') {
            console.warn(`[AuctionEngine] Bid rejected: Auction ${auctionId} already ended.`);
            return null;
        }
        // RULE 2: Minimum increment check
        const currentPrice = auction.currentPrice || auction.startPrice;
        if (txData.amount < currentPrice + auction.minimumIncrement) {
            console.warn(`[AuctionEngine] Bid rejected: Amount ${txData.amount} below minimum increment.`);
            return null;
        }
        // RULE 3: Timing check
        if (new Date() > new Date(auction.endTime)) {
            auction.status = 'ended';
            this.saveState();
            return null;
        }
        // Valid Bid Construction
        const newBid = {
            id: txData.hash,
            auctionId: auction.id,
            bidderAddress: txData.sender,
            amount: txData.amount,
            timestamp: new Date(txData.timestamp),
            status: 'detected',
            txHash: txData.hash
        };
        // Update Auction State
        auction.bids.unshift(newBid);
        auction.bidCount++;
        auction.currentPrice = txData.amount;
        auction.highestBidder = {
            address: txData.sender
        };
        this.saveState();
        console.log(`[AuctionEngine] Valid bid accepted: ${txData.amount} KAS from ${txData.sender}`);
        return newBid;
    }
    finalizeAuction(auctionId) {
        const auction = this.auctions.get(auctionId);
        if (!auction)
            return null;
        auction.status = 'ended';
        this.saveState();
        return auction;
    }
    getAuction(id) {
        return this.auctions.get(id);
    }
    getAllAuctions() {
        return Array.from(this.auctions.values());
    }
}
exports.AuctionEngine = AuctionEngine;
exports.auctionEngine = new AuctionEngine();
