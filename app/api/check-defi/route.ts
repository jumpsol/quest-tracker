import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';

const RPC_ENDPOINT = 'https://mainnet.helius-rpc.com/?api-key=fdeec242-8b73-41cd-b9e3-3ca680a2afc5';

// Known program IDs
const PROGRAM_IDS: Record<string, string> = {
  jupiter: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  meteora: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
  raydium: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  orca: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { wallets, platform, actionType, minVolume } = body;

    if (!wallets || !Array.isArray(wallets) || wallets.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Wallets are required' },
        { status: 400 }
      );
    }

    const connection = new Connection(RPC_ENDPOINT, 'confirmed');
    const allTransactions = [];
    let foundValidTx = false;

    // Check each wallet
    for (const walletAddress of wallets) {
      try {
        const pubkey = new PublicKey(walletAddress.trim());
        
        // Get recent signatures
        const signatures = await connection.getSignaturesForAddress(pubkey, {
          limit: 50,
        });

        // Check each transaction
        for (const sig of signatures) {
          try {
            const tx = await connection.getParsedTransaction(sig.signature, {
              maxSupportedTransactionVersion: 0,
            });

            if (!tx || !tx.meta || tx.meta.err) continue;

            // Get all account keys from the transaction
            const accountKeys = tx.transaction.message.accountKeys.map(
              (key: any) => key.pubkey.toString()
            );

            // Check if transaction involves the target platform
            let platformMatch = false;
            
            if (platform === 'custom') {
              // For custom platform, just check if there's any valid transaction
              platformMatch = true;
            } else if (platform && PROGRAM_IDS[platform.toLowerCase()]) {
              const targetProgramId = PROGRAM_IDS[platform.toLowerCase()];
              platformMatch = accountKeys.includes(targetProgramId);
            } else {
              // If no specific platform, accept any DEX transaction
              platformMatch = Object.values(PROGRAM_IDS).some(programId =>
                accountKeys.includes(programId)
              );
            }

            if (platformMatch) {
              foundValidTx = true;
              allTransactions.push({
                signature: sig.signature,
                blockTime: tx.blockTime,
                slot: tx.slot,
                wallet: walletAddress,
                platform: platform || 'detected',
              });
            }
          } catch (txError) {
            console.error('Error processing transaction:', txError);
            continue;
          }
        }
      } catch (walletError) {
        console.error(`Error checking wallet ${walletAddress}:`, walletError);
        continue;
      }
    }

    if (foundValidTx) {
      return NextResponse.json({
        success: true,
        verified: true,
        transactions: allTransactions.slice(0, 10), // Return max 10 transactions
        message: `Found ${allTransactions.length} valid transaction(s)`,
      });
    } else {
      return NextResponse.json({
        success: true,
        verified: false,
        transactions: [],
        message: 'No valid transactions found',
      });
    }
  } catch (error: any) {
    console.error('DeFi check error:', error);
    return NextResponse.json(
      { 
        success: false, 
        verified: false,
        error: error.message || 'Failed to verify transaction',
        transactions: []
      },
      { status: 500 }
    );
  }
}
