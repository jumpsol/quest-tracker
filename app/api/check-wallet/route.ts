import { NextRequest, NextResponse } from 'next/server';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || 'fdeec242-8b73-41cd-b9e3-3ca680a2afc5';
const RPC_ENDPOINT = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// USDC Token Mint Address
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Get UTC day bounds
function getUTCDayBounds(): { start: number; end: number; dateString: string } {
  const now = new Date();
  
  const startOfDay = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  ));
  
  const endOfDay = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    23, 59, 59, 999
  ));
  
  return {
    start: Math.floor(startOfDay.getTime() / 1000),
    end: Math.floor(endOfDay.getTime() / 1000),
    dateString: now.toISOString().split('T')[0],
  };
}

// Get USDC token account for a wallet
async function getUSDCTokenAccount(walletAddress: string): Promise<string | null> {
  try {
    const response = await fetch(RPC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          { mint: USDC_MINT },
          { encoding: 'jsonParsed' }
        ]
      }),
    });
    
    const data = await response.json();
    return data.result?.value?.[0]?.pubkey || null;
  } catch (error) {
    console.error('[check-wallet] Error getting token account:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { savingsWallet, sourceWallet, minAmount = 0, tokenType = 'SOL' } = body;

    if (!savingsWallet) {
      return NextResponse.json({ error: 'Missing savingsWallet' }, { status: 400 });
    }

    const { start: startOfDayUTC, end: endOfDayUTC, dateString } = getUTCDayBounds();

    console.log(`[check-wallet] Checking wallet: ${savingsWallet}`);
    console.log(`[check-wallet] Source wallet: ${sourceWallet || 'any'}`);
    console.log(`[check-wallet] Token type: ${tokenType}`);
    console.log(`[check-wallet] Min amount: ${minAmount}`);
    console.log(`[check-wallet] UTC Date: ${dateString}`);
    console.log(`[check-wallet] Time range: ${startOfDayUTC} - ${endOfDayUTC}`);

    // Determine which addresses to check
    const addressesToCheck: string[] = [savingsWallet];
    
    // If checking USDC, also get the token account address
    if (tokenType === 'USDC' || tokenType === 'BOTH') {
      const usdcTokenAccount = await getUSDCTokenAccount(savingsWallet);
      if (usdcTokenAccount) {
        addressesToCheck.push(usdcTokenAccount);
        console.log(`[check-wallet] USDC Token Account: ${usdcTokenAccount}`);
      }
    }

    let allSignatures: any[] = [];
    
    // Fetch signatures from all addresses
    for (const address of addressesToCheck) {
      const sigResponse = await fetch(RPC_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getSignaturesForAddress',
          params: [address, { limit: 50 }],
        }),
      });

      const sigData = await sigResponse.json();
      if (sigData.result && Array.isArray(sigData.result)) {
        allSignatures = [...allSignatures, ...sigData.result];
      }
    }

    // Remove duplicates by signature
    const uniqueSignatures = Array.from(
      new Map(allSignatures.map(s => [s.signature, s])).values()
    );

    console.log(`[check-wallet] Total unique signatures: ${uniqueSignatures.length}`);

    // Filter transactions for today (UTC)
    const todaySignatures = uniqueSignatures.filter((sig: any) => {
      const blockTime = sig.blockTime;
      return blockTime >= startOfDayUTC && blockTime <= endOfDayUTC;
    });

    console.log(`[check-wallet] Found ${todaySignatures.length} transactions today (UTC)`);

    if (todaySignatures.length === 0) {
      return NextResponse.json({
        isCompleted: false,
        message: `No transactions found today (UTC: ${dateString})`,
        utcDate: dateString,
        todayStats: { totalSOL: '0', totalUSDC: '0', txCount: 0 },
      });
    }

    // Check each transaction
    let totalSOL = 0;
    let totalUSDC = 0;
    const matchingTransactions: any[] = [];

    for (const sig of todaySignatures) {
      try {
        const txResponse = await fetch(RPC_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTransaction',
            params: [sig.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
          }),
        });

        const txData = await txResponse.json();
        
        if (!txData.result?.transaction?.message?.instructions) {
          continue;
        }

        const instructions = txData.result.transaction.message.instructions;
        const innerInstructions = txData.result.meta?.innerInstructions || [];
        
        // Flatten all instructions (including inner)
        const allInstructions = [
          ...instructions,
          ...innerInstructions.flatMap((inner: any) => inner.instructions || [])
        ];

        for (const ix of allInstructions) {
          // Check SOL transfer (system program)
          if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
            const info = ix.parsed.info;
            
            // Check if transfer is TO savings wallet
            if (info?.destination === savingsWallet) {
              // Check source wallet if specified
              if (sourceWallet && info.source !== sourceWallet) {
                continue;
              }
              
              const solAmount = (info.lamports || 0) / 1e9;
              
              if (tokenType === 'SOL' || tokenType === 'BOTH') {
                totalSOL += solAmount;
                matchingTransactions.push({
                  signature: sig.signature,
                  type: 'SOL',
                  amount: solAmount,
                  from: info.source,
                  to: info.destination,
                  blockTime: sig.blockTime,
                });
              }
            }
          }

          // Check SPL Token transfer (USDC) - both 'transfer' and 'transferChecked'
          if (ix.program === 'spl-token') {
            const parsed = ix.parsed;
            
            // Handle both 'transfer' and 'transferChecked' types
            if (parsed?.type === 'transfer' || parsed?.type === 'transferChecked') {
              const info = parsed.info;
              
              // For transferChecked, check if it's USDC
              if (parsed.type === 'transferChecked') {
                if (info.mint !== USDC_MINT) {
                  continue; // Not USDC
                }
              }

              // Get token amount
              let tokenAmount = 0;
              if (info.tokenAmount?.uiAmount) {
                tokenAmount = info.tokenAmount.uiAmount;
              } else if (info.amount) {
                // USDC has 6 decimals
                tokenAmount = parseFloat(info.amount) / 1e6;
              }

              // For SPL tokens, we need to check the token accounts
              // The destination is a token account, not the wallet directly
              // We need to verify the owner of the destination token account
              
              const destTokenAccount = info.destination;
              
              // Check if this token account belongs to savings wallet
              // We'll do this by checking the transaction's postTokenBalances
              const postBalances = txData.result.meta?.postTokenBalances || [];
              const preBalances = txData.result.meta?.preTokenBalances || [];
              
              // Find if savings wallet received USDC
              const savingsReceived = postBalances.some((balance: any) => {
                return balance.owner === savingsWallet && 
                       balance.mint === USDC_MINT;
              });

              // Also check by looking at balance changes
              let receivedAmount = 0;
              for (const post of postBalances) {
                if (post.owner === savingsWallet && post.mint === USDC_MINT) {
                  const pre = preBalances.find((p: any) => 
                    p.owner === savingsWallet && p.mint === USDC_MINT
                  );
                  const preAmount = pre?.uiTokenAmount?.uiAmount || 0;
                  const postAmount = post.uiTokenAmount?.uiAmount || 0;
                  receivedAmount = postAmount - preAmount;
                }
              }

              // If we found a positive balance change for savings wallet
              if (receivedAmount > 0 || (savingsReceived && tokenAmount > 0)) {
                const finalAmount = receivedAmount > 0 ? receivedAmount : tokenAmount;
                
                // Check source wallet if specified
                if (sourceWallet) {
                  const fromSourceWallet = preBalances.some((balance: any) => {
                    return balance.owner === sourceWallet && balance.mint === USDC_MINT;
                  }) || info.authority === sourceWallet || info.source?.includes(sourceWallet);
                  
                  // Also check signers
                  const signers = txData.result.transaction.message.accountKeys
                    ?.filter((k: any) => k.signer)
                    ?.map((k: any) => k.pubkey) || [];
                  
                  const isFromSource = fromSourceWallet || signers.includes(sourceWallet);
                  
                  if (!isFromSource) {
                    // Double check by looking at who signed the transaction
                    const allSigners = txData.result.transaction.message.accountKeys || [];
                    const sourceIsSigner = allSigners.some((acc: any) => 
                      (acc.pubkey === sourceWallet || acc === sourceWallet) && acc.signer
                    );
                    if (!sourceIsSigner) {
                      continue;
                    }
                  }
                }

                if (tokenType === 'USDC' || tokenType === 'BOTH') {
                  totalUSDC += finalAmount;
                  matchingTransactions.push({
                    signature: sig.signature,
                    type: 'USDC',
                    amount: finalAmount,
                    blockTime: sig.blockTime,
                  });
                }
              }
            }
          }
        }
      } catch (txError) {
        console.error(`[check-wallet] Error processing tx ${sig.signature}:`, txError);
      }
    }

    console.log(`[check-wallet] Total SOL: ${totalSOL}, Total USDC: ${totalUSDC}`);
    console.log(`[check-wallet] Matching transactions: ${matchingTransactions.length}`);

    // Determine if quest is completed based on token type and min amount
    let isCompleted = false;
    
    if (tokenType === 'SOL') {
      isCompleted = totalSOL >= minAmount;
    } else if (tokenType === 'USDC') {
      isCompleted = totalUSDC >= minAmount;
    } else if (tokenType === 'BOTH') {
      isCompleted = totalSOL >= minAmount || totalUSDC >= minAmount;
    }

    return NextResponse.json({
      isCompleted,
      message: isCompleted 
        ? `Found qualifying transfers today (UTC)` 
        : `No qualifying transfers found (need ${minAmount} ${tokenType})`,
      utcDate: dateString,
      todayStats: {
        totalSOL: totalSOL.toFixed(4),
        totalUSDC: totalUSDC.toFixed(2),
        txCount: matchingTransactions.length,
      },
      transactions: matchingTransactions.slice(0, 5),
      debug: {
        signaturesChecked: todaySignatures.length,
        matchingTxCount: matchingTransactions.length,
        tokenType,
        minAmount,
      }
    });

  } catch (error) {
    console.error('[check-wallet] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
