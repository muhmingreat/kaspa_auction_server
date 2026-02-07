"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockAuctions = void 0;
exports.mockAuctions = [
    {
        id: '1',
        title: 'Vintage Kaspa Physical Coin',
        description: 'Limited edition physical representation of Kaspa. Made of pure copper.',
        imageUrl: 'https://placehold.co/600x400/indigo/white?text=Kaspa+Coin',
        seller: {
            address: 'kaspa:qpm2qsrpvvqzps7x27de69v907atvuvm6gyt86pvl2',
            name: 'KaspaCollector'
        },
        startPrice: 100,
        currentPrice: 100,
        minimumIncrement: 10,
        startTime: new Date(),
        endTime: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24 hours from now
        status: 'live',
        bids: [],
        bidCount: 0
    },
    {
        id: '2',
        title: 'Kaspa BlockDAG NFT #001',
        description: 'The first ever generated visualization of the Kaspa BlockDAG as an NFT.',
        imageUrl: 'https://placehold.co/600x400/indigo/white?text=BlockDAG+NFT',
        seller: {
            address: 'kaspa:qrs8qsrpvvqzps7x27de69v907atvuvm6gyt86pvl2',
            name: 'DigitalArtist'
        },
        startPrice: 500,
        currentPrice: 500,
        minimumIncrement: 50,
        startTime: new Date(),
        endTime: new Date(Date.now() + 1000 * 60 * 60), // 1 hour from now
        status: 'live',
        bids: [],
        bidCount: 0
    }
];
