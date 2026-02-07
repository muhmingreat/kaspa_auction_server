import { AuctionEngine } from '../src/engine';
import { Auction } from '../../types/auction';

describe('AuctionEngine', () => {
    let engine: AuctionEngine;
    const mockAuction: Auction = {
        id: 'test-1',
        title: 'Test Auction',
        description: 'Desc',
        imageUrl: '',
        seller: { address: 'kaspa:123' },
        startPrice: 100,
        currentPrice: 100,
        minimumIncrement: 10,
        startTime: new Date(Date.now() - 10000),
        endTime: new Date(Date.now() + 10000),
        status: 'live',
        bids: [],
        bidCount: 0
    };

    beforeEach(() => {
        engine = new AuctionEngine();
        engine.createAuction(mockAuction);
    });

    it('should accept a valid bid', async () => {
        const txData = {
            hash: 'tx1',
            amount: 120,
            sender: 'bidder1',
            timestamp: Date.now()
        };

        const bid = await engine.processOnChainBid('test-1', txData);
        expect(bid).not.toBeNull();
        expect(bid?.amount).toBe(120);

        const auction = engine.getAuction('test-1');
        expect(auction?.currentPrice).toBe(120);
        expect(auction?.bidCount).toBe(1);
    });

    it('should reject a bid below minimum increment', async () => {
        const txData = {
            hash: 'tx2',
            amount: 105, // Only +5, increment is 10
            sender: 'bidder2',
            timestamp: Date.now()
        };

        const bid = await engine.processOnChainBid('test-1', txData);
        expect(bid).toBeNull();
    });

    it('should reject a bid for an ended auction', async () => {
        engine.finalizeAuction('test-1');

        const txData = {
            hash: 'tx3',
            amount: 200,
            sender: 'bidder3',
            timestamp: Date.now()
        };

        const bid = await engine.processOnChainBid('test-1', txData);
        expect(bid).toBeNull();
    });
});
