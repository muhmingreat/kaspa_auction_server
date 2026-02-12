import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * KaspaService handles communication with the Kaspa BlockDAG.
 * It connects to a Kaspa API (Rest API) for transaction verification and UTXO monitoring.
 */
export class KaspaService {
    private rpcUrl: string;
    private fallbackUrls: string[] = [];

    constructor() {
        const network = process.env.NETWORK || 'mainnet';
        if (network === 'testnet') {
            this.rpcUrl = process.env.KASPA_RPC_URL_TESTNET || 'https://api-tn10.kaspa.org';
            this.fallbackUrls = [
                'https://api-tn10.kaspa.org',
                'https://kaspa-rest.fyi' // Added as a potential fallback from research
            ];
        } else {
            this.rpcUrl = process.env.KASPA_RPC_URL || 'https://api.kaspa.org';
            this.fallbackUrls = ['https://api.kaspa.org'];
        }
    }

    /**
     * Helper to perform GET requests with retries and fallback endpoint rotation.
     */
    private async fetchWithRetry(path: string, retries = 3): Promise<any> {
        let lastError: any;
        const urls = [this.rpcUrl, ...this.fallbackUrls.filter(u => u !== this.rpcUrl)];

        for (const url of urls) {
            for (let i = 0; i < retries; i++) {
                try {
                    const response = await axios.get(`${url}${path}`, { timeout: 15000 });
                    return response.data;
                } catch (error: any) {
                    lastError = error;
                    const status = error.response?.status;
                    const message = error.message || '';
                    const errMsg = (error.toString() || '').toLowerCase();

                    // Log warning
                    console.warn(`[KaspaService] Attempt ${i + 1} failed for ${url}${path}: ${status || message}`);

                    // Don't retry on 404 (Not Found)
                    if (status === 404) throw error;

                    // Check for SSL/Network specific errors to ensure we retry
                    const isSSLError = errMsg.includes('ssl') || errMsg.includes('bad record mac') || errMsg.includes('econnreset');

                    // Exponential backoff
                    if (i < retries - 1) {
                        const waitTime = Math.pow(2, i) * 1000;
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                    }
                }
            }
            console.warn(`[KaspaService] All retries failed for ${url}, trying next fallback...`);
        }

        throw lastError;
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

        try {
            const data = await this.fetchWithRetry(`/addresses/${address}/utxos`);

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
            console.error(`[KaspaService] Failed to fetch UTXOs for ${address} after all retries.`);
            return [];
        }
    }

    /**
     * Verifies a specific transaction hash and returns its confirmations / status.
     */
    public async verifyTransaction(txHash: string) {
        try {
            const tx = await this.fetchWithRetry(`/transactions/${txHash}`);

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

                    const prevTx = await this.fetchWithRetry(`/transactions/${prevHash}`);

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
                outputs: tx.outputs, // Return full outputs for better validation
                sender: sender,
                timestamp: tx.block_time || Date.now()
            };
        } catch (error) {
            console.error(`[KaspaService] Failed to verify tx ${txHash} after all retries.`);
            return null;
        }
    }

    /**
     * Helper to get the current network blue score (DAG height/depth indicator)
     */
    public async getNetworkInfo() {
        try {
            return await this.fetchWithRetry('/info/dagconfig');
        } catch (error) {
            console.error('[KaspaService] Failed to fetch network info after all retries.');
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
        let isRunning = true;

        const check = async () => {
            if (!isRunning) return;

            try {
                const utxos = await this.getAddressUtxos(address);
                if (!utxos || !Array.isArray(utxos)) {
                    // Check again later
                    setTimeout(check, 5000);
                    return;
                }

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
            } finally {
                // Schedule next check only after this one completes
                if (isRunning) {
                    setTimeout(check, 2000);
                }
            }
        };

        check(); // Initial check

        return () => {
            isRunning = false;
        };
    }
}

export const kaspaService = new KaspaService();
