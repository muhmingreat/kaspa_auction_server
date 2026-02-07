import fs from 'fs';
import path from 'path';
import { Bid, Auction, BidStatus } from '../../types/auction';
import { kaspaService } from './kaspa';

const DATA_PATH = path.join(__dirname, '../data/auctions.json');

export class AuctionEngine {
    private auctions: Map<string, Auction> = new Map();

    constructor() {
        this.loadState();
    }

    private loadState() {
        try {
            if (fs.existsSync(DATA_PATH)) {
                const data = fs.readFileSync(DATA_PATH, 'utf-8');
                const parsed = JSON.parse(data);
                Object.entries(parsed).forEach(([id, auction]) => {
                    this.auctions.set(id, auction as Auction);
                });
                console.log(`[AuctionEngine] Loaded ${this.auctions.size} auctions from disk.`);
            }
        } catch (error) {
            console.error('[AuctionEngine] Failed to load state:', error);
        }
    }

    private saveState() {
        try {
            const dir = path.dirname(DATA_PATH);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const data = JSON.stringify(Object.fromEntries(this.auctions), null, 2);
            fs.writeFileSync(DATA_PATH, data);
        } catch (error) {
            console.error('[AuctionEngine] Failed to save state:', error);
        }
    }

    /**
     * Creates a new auction in the engine
     */
    public createAuction(auction: Auction) {
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
    public async processOnChainBid(auctionId: string, txData: {
        hash: string;
        amount: number;
        sender: string;
        timestamp: number;
    }): Promise<Bid | null> {
        const auction = this.auctions.get(auctionId);
        if (!auction) return null;

        // RULE 0: Re-verify cryptographic proof from the network
        const txOnChain = await kaspaService.verifyTransaction(txData.hash);
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
        const newBid: Bid = {
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

    public finalizeAuction(auctionId: string): Auction | null {
        const auction = this.auctions.get(auctionId);
        if (!auction) return null;

        auction.status = 'ended';
        this.saveState();
        return auction;
    }

    public deleteAuction(auctionId: string): boolean {
        const auction = this.auctions.get(auctionId);
        if (!auction) return false;

        // Double check: Only allow delete if no bids (redundant safety)
        if (auction.bids.length > 0) return false;

        this.auctions.delete(auctionId);
        this.saveState();
        console.log(`[AuctionEngine] Deleted auction: ${auctionId}`);
        return true;
    }

    public cleanupOldAuctions() {
        const TWO_MONTHS_MS = 60 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        let deletedCount = 0;

        for (const [id, auction] of this.auctions.entries()) {
            const endTime = new Date(auction.endTime).getTime();
            if (now - endTime > TWO_MONTHS_MS) {
                this.auctions.delete(id);
                deletedCount++;
            }
        }

        if (deletedCount > 0) {
            this.saveState();
            console.log(`[AuctionEngine] Cleaned up ${deletedCount} old auctions.`);
        }
    }

    public getAuction(id: string): Auction | undefined {
        return this.auctions.get(id);
    }

    public getAllAuctions(): Auction[] {
        // Run lazy cleanup on fetch
        this.cleanupOldAuctions();
        return Array.from(this.auctions.values());
    }
}

export const auctionEngine = new AuctionEngine();
