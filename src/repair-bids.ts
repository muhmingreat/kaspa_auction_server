import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';
import { kaspaService } from './kaspa';

// Load environment variables from server root
// .env is in server/.env, current file is server/src/repair-bids.ts
// so ../.env is correct
dotenv.config({ path: path.join(__dirname, '../.env') });

// Data file is in server/data/auctions.json
// so ../data/auctions.json is correct
const DATA_PATH = path.join(__dirname, '../data/auctions.json');

async function repair() {
    console.log('Starting repair process...');
    console.log('Data path:', DATA_PATH);

    if (!fs.existsSync(DATA_PATH)) {
        console.error('Data file not found!');
        return;
    }

    const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
    let fixedCount = 0;

    for (const auctionId in data) {
        const auction = data[auctionId];
        if (auction.bids) {
            for (const bid of auction.bids) {
                if (!bid.bidderAddress && bid.txHash) {
                    console.log(`Fixing bid ${bid.id} in auction ${auctionId}...`);
                    try {
                        const txInfo = await kaspaService.verifyTransaction(bid.txHash);
                        if (txInfo && txInfo.sender) {
                            bid.bidderAddress = txInfo.sender;
                            fixedCount++;
                            console.log(`  -> Fixed! Sender: ${txInfo.sender}`);
                        } else {
                            console.log(`  -> Could not resolve sender for ${bid.txHash}`);
                        }
                    } catch (err) {
                        console.error(`  -> Error resolving ${bid.txHash}:`, err);
                    }
                    // Rate limit to be nice to API
                    await new Promise(r => setTimeout(r, 200));
                }
            }
        }

        // Also fix highestBidder if needed
        if (auction.highestBidder && !auction.highestBidder.address) {
            if (auction.bids && auction.bids.length > 0) {
                // Assuming bids are sorted desc by time/logic in engine.
                // let's retry checking the top bid.
                const topBid = auction.bids[0]; // Assuming first is top/newest
                // If the top bid matches the current price and has an address (which we might have just fixed)
                if (topBid.amount === auction.currentPrice && topBid.bidderAddress) {
                    auction.highestBidder.address = topBid.bidderAddress;
                    console.log(`  -> Top bid matched, updated highestBidder for ${auctionId}`);
                }
            }
        }
    }

    if (fixedCount > 0) {
        try {
            fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
            console.log(`SUCCESS: Repaired ${fixedCount} bids and saved to ${DATA_PATH}`);
        } catch (writeErr) {
            console.error('ERROR: Failed to write data file:', writeErr);
        }
    } else {
        console.log('No bids needed repair or repair process found no solvable bids.');
    }
}

console.log('Script loaded. Executing repair...');
repair().then(() => console.log('Repair process finished.')).catch(err => console.error('Fatal Script Error:', err));
