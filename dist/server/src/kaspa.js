"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.kaspaService = exports.KaspaService = void 0;
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
/**
 * KaspaService handles communication with the Kaspa BlockDAG.
 * It connects to a Kaspa API (Rest API) for transaction verification and UTXO monitoring.
 */
class KaspaService {
    rpcUrl;
    constructor() {
        this.rpcUrl = process.env.KASPA_RPC_URL || 'https://api.kaspa.org';
    }
    /**
     * Checks the balance and UTXOs for a given address.
     */
    async getAddressUtxos(address) {
        try {
            const response = await axios_1.default.get(`${this.rpcUrl}/addresses/${address}/utxos`);
            return response.data;
        }
        catch (error) {
            console.error(`[KaspaService] Error fetching UTXOs for ${address}:`, error);
            return [];
        }
    }
    /**
     * Verifies a specific transaction hash and returns its confirmations / status.
     */
    async verifyTransaction(txHash) {
        try {
            const response = await axios_1.default.get(`${this.rpcUrl}/transactions/${txHash}`);
            const tx = response.data;
            if (!tx || !tx.outputs)
                return null;
            // In Kaspa, 'is_accepted' indicates the transaction is part of the accepted DAG
            return {
                isAccepted: tx.is_accepted,
                blueScore: tx.accepting_block_blue_score,
                amount: (tx.outputs[0]?.amount || 0) / 1e8, // Convert Sompi to KAS
                sender: tx.inputs[0]?.previous_outpoint_address,
                timestamp: tx.block_time || Date.now()
            };
        }
        catch (error) {
            console.error(`[KaspaService] Error verifying tx ${txHash}:`, error);
            return null;
        }
    }
    /**
     * Helper to get the current network blue score (DAG height/depth indicator)
     */
    async getNetworkInfo() {
        try {
            const response = await axios_1.default.get(`${this.rpcUrl}/info/dagconfig`);
            return response.data;
        }
        catch (error) {
            console.error('[KaspaService] Error fetching network info:', error);
            return null;
        }
    }
}
exports.KaspaService = KaspaService;
exports.kaspaService = new KaspaService();
