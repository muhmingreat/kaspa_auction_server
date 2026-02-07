import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * KaspaService handles communication with the Kaspa BlockDAG.
 * It connects to a Kaspa API (Rest API) for transaction verification and UTXO monitoring.
 */
export class KaspaService {
    private rpcUrl: string;

    constructor() {
        const network = process.env.NETWORK || 'mainnet';
        this.rpcUrl = network === 'testnet'
            ? process.env.KASPA_RPC_URL_TESTNET || 'https://api-tn10.kaspa.org'
            : process.env.KASPA_RPC_URL || 'https://api.kaspa.org';
    }

    /**
     * Checks the balance and UTXOs for a given address.
     */
    public async getAddressUtxos(address: string) {
        // Validate address format (testnet or mainnet)
        if (!/^kaspa(test)?:[a-z0-9]+$/i.test(address)) {
            console.error(`[KaspaService] Invalid address format: ${address}`);
            return [];
        }
        // Use plain address (no percent‑encoding) for the API request
        const url = `${this.rpcUrl}/addresses/${address}/utxos`;
        try {
            const response = await axios.get(url);
            const data = response.data;

            // Map API response to expected internal format
            // API returns: { outpoint: { transactionId, index }, utxoEntry: { amount, ... } }
            if (Array.isArray(data)) {
                return data.map((item: any) => ({
                    utxoId: `${item.outpoint.transactionId}:${item.outpoint.index}`,
                    amount: Number(item.utxoEntry.amount),
                    // Keep original data just in case
                    raw: item
                }));
            }
            return [];
        } catch (error) {
            console.error(`[KaspaService] Error fetching UTXOs for ${address}:`, error);
            return [];
        }
    }

    /**
     * Verifies a specific transaction hash and returns its confirmations / status.
     */
    public async verifyTransaction(txHash: string) {
        try {
            const response = await axios.get(`${this.rpcUrl}/transactions/${txHash}`);
            const tx = response.data;

            if (!tx || !tx.outputs) return null;

            console.log(`[KaspaService] Inspecting TX ${txHash}:`, JSON.stringify(tx, null, 2));

            // In Kaspa, 'is_accepted' indicates the transaction is part of the accepted DAG
            let sender = tx.inputs[0]?.previous_outpoint_address;

            // Fallback: Resolve sender from previous transaction if not present
            if (!sender && tx.inputs[0]?.previous_outpoint_hash) {
                try {
                    const prevHash = tx.inputs[0].previous_outpoint_hash;
                    const prevIndex = tx.inputs[0].previous_outpoint_index;
                    console.log(`[KaspaService] Resolving sender for ${txHash} from prevTx ${prevHash}:${prevIndex}`);

                    const prevRes = await axios.get(`${this.rpcUrl}/transactions/${prevHash}`);
                    const prevTx = prevRes.data;

                    if (prevTx && prevTx.outputs && prevTx.outputs[prevIndex]) {
                        sender = prevTx.outputs[prevIndex].script_public_key_address;
                        console.log(`[KaspaService] Resolved sender: ${sender}`);
                    }
                } catch (err) {
                    console.error(`[KaspaService] Failed to resolve sender for ${txHash}:`, err);
                }
            }

            return {
                isAccepted: tx.is_accepted,
                blueScore: tx.accepting_block_blue_score,
                amount: (tx.outputs[0]?.amount || 0) / 1e8, // Convert Sompi to KAS
                sender: sender,
                timestamp: tx.block_time || Date.now()
            };
        } catch (error) {
            console.error(`[KaspaService] Error verifying tx ${txHash}:`, error);
            return null;
        }
    }

    /**
     * Helper to get the current network blue score (DAG height/depth indicator)
     */
    public async getNetworkInfo() {
        try {
            const response = await axios.get(`${this.rpcUrl}/info/dagconfig`);
            return response.data;
        } catch (error) {
            console.error('[KaspaService] Error fetching network info:', error);
            return null;
        }
    }

    /**
     * Monitors a Kaspa address for new UTXOs/Transactions.
     * This uses a simple polling mechanism for the hackathon MVP.
     */
    public monitorAddress(address: string, onNewTx: (tx: any) => void) {
        let lastSeenUtxos = new Set<string>();
        let isFirstCheck = true;

        const check = async () => {
            try {
                const utxos = await this.getAddressUtxos(address);
                if (!utxos || !Array.isArray(utxos)) return;

                const currentUtxoIds = new Set(utxos.map((u: any) => `${u.utxoId}-${u.amount}`));

                if (!isFirstCheck) {
                    for (const utxo of utxos) {
                        const id = `${utxo.utxoId}-${utxo.amount}`;
                        if (!lastSeenUtxos.has(id)) {
                            // New UTXO detected!
                            console.log(`[KaspaService] New UTXO detected on ${address}: ${utxo.amount} Sompi`);

                            // Get transaction details for more info
                            const txInfo = await this.verifyTransaction(utxo.utxoId.split(':')[0]);
                            if (txInfo) {
                                onNewTx({
                                    hash: utxo.utxoId.split(':')[0],
                                    amount: utxo.amount / 1e8,
                                    sender: txInfo.sender,
                                    timestamp: txInfo.timestamp
                                });
                            }
                        }
                    }
                }

                lastSeenUtxos = currentUtxoIds;
                isFirstCheck = false;
            } catch (error) {
                console.error(`[KaspaService] Error monitoring ${address}:`, error);
            }
        };

        // Poll every 2 seconds for fresh updates (Kaspa is fast!)
        const interval = setInterval(check, 2000);
        check(); // Initial check

        return () => clearInterval(interval);
    }
}

export const kaspaService = new KaspaService();
