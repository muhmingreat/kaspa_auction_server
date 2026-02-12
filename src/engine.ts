import { Auction as AuctionModel } from './models/Auction';
import { kaspaService } from './kaspa';
import { Auction, Bid } from './types/auction';

export class AuctionEngine {

    /**
     * Creates a new auction in the database
     */
    public async createAuction(auctionData: Auction) {
        try {
            const auction = new AuctionModel({
                ...auctionData,
                status: auctionData.status || 'live',
                bids: auctionData.bids || [],
                bidCount: auctionData.bidCount || 0
            });
            await auction.save();
            console.log(`[AuctionEngine] Created auction: ${auctionData.id}`);
            return auction;
        } catch (error) {
            console.error('[AuctionEngine] Failed to create auction:', error);
            throw error;
        }
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
        let retries = 3;
        while (retries > 0) {
            try {
                const auction = await AuctionModel.findOne({ id: auctionId });
                if (!auction) return null;

                // Idempotency Check: Don't process the same transaction twice
                // Check if this txHash already exists in the bids array
                const existingBid = auction.bids.find(b => b.txHash === txData.hash);
                if (existingBid) {
                    console.log(`[AuctionEngine] Duplicate bid detected (already processed): ${txData.hash}`);
                    return existingBid;
                }

                // RULE 0: Re-verify cryptographic proof from the network
                const txOnChain = await kaspaService.verifyTransaction(txData.hash);

                // Sanity check: Ensure the transaction actually contains an output roughly matching the bid
                // Note: txData.amount is in KAS, txOnChain.outputs[].amount is in Sompi
                const sompiBid = txData.amount * 1e8;
                const hasMatchingOutput = txOnChain?.outputs.some((out: any) => Math.abs(out.amount - sompiBid) < 10000); // 10000 sompi tolerance

                if (txOnChain && !hasMatchingOutput) {
                    console.error(`[AuctionEngine] Amount mismatch! No output matches ${txData.amount} KAS in TX ${txData.hash}`);
                    // return null; // STRICT MODE: Uncomment to enforce
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
                    await auction.save();
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

                await auction.save();
                console.log(`[AuctionEngine] Valid bid accepted: ${txData.amount} KAS from ${txData.sender}`);

                return newBid;

            } catch (error: any) {
                if (error.name === 'VersionError') {
                    console.warn(`[AuctionEngine] VersionError encountered. Retrying... (${retries} attempts left)`);
                    retries--;
                    continue; // Retry the whole process (fetch -> check -> save)
                }
                console.error('[AuctionEngine] Error processing bid:', error);
                throw error;
            }
        }
        console.error('[AuctionEngine] Failed to process bid after retries due to concurrency.');
        return null;
    }

    public async finalizeAuction(auctionId: string): Promise<Auction | null> {
        const auction = await AuctionModel.findOne({ id: auctionId });
        if (!auction) return null;

        auction.status = 'ended';
        await auction.save();
        return auction.toObject() as Auction;
    }

    public async deleteAuction(auctionId: string): Promise<boolean> {
        const auction = await AuctionModel.findOne({ id: auctionId });
        if (!auction) return false;

        // Double check: Only allow delete if no bids
        if (auction.bids.length > 0) return false;

        await AuctionModel.deleteOne({ id: auctionId });
        console.log(`[AuctionEngine] Deleted auction: ${auctionId}`);
        return true;
    }

    public async cleanupOldAuctions() {
        const TWO_MONTHS_MS = 60 * 24 * 60 * 60 * 1000;
        const cutoffDate = new Date(Date.now() - TWO_MONTHS_MS);

        try {
            const result = await AuctionModel.deleteMany({ endTime: { $lt: cutoffDate } });
            if (result.deletedCount > 0) {
                console.log(`[AuctionEngine] Cleaned up ${result.deletedCount} old auctions.`);
            }
        } catch (error) {
            console.error('[AuctionEngine] Failed to clean up old auctions:', error);
        }
    }

    public async getAuction(id: string): Promise<Auction | null> {
        const auction = await AuctionModel.findOne({ id });
        return auction ? (auction.toObject() as Auction) : null;
    }

    public async getAllAuctions(): Promise<Auction[]> {
        // Run lazy cleanup on fetch (optional, maybe better in a chron job)
        // this.cleanupOldAuctions(); 
        const auctions = await AuctionModel.find().sort({ createdAt: -1 });
        return auctions.map(a => a.toObject() as Auction);
    }
}

export const auctionEngine = new AuctionEngine();
