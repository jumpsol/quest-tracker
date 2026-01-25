import { NextRequest, NextResponse } from 'next/server';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || 'fdeec242-8b73-41cd-b9e3-3ca680a2afc5';
const RPC_ENDPOINT = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// Known DeFi program IDs
const PROGRAM_IDS: Record<string, string[]> = {
  jupiter: ['JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB'],
  meteora: ['LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo', 'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB'],
  raydium: ['675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK'],
  orca: ['whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP'],
  titan: ['TITAN7VfQvnFwWHhJjJLQn8S7SfgsL65vWNSckQvp2F', 'TITANQvGLLPjnPzzLTRwm7xagDjKExqR7naRMz6N8yG'],
  marinade: ['MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD'],
  lifinity: ['2wT8Yq49kHgDzXuPxZSaeLaH1qbmGXtEyPy64bL7aD3c'],
  phoenix: ['PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY'],
  drift: ['dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH'],
  sanctum: ['5ocnV1qiCgaQR8Jb8xWnVbApfaygJ8tNoZfgPwsgx9kx'],
  kamino: ['KLend2g3cP87ber41SdPpZskyrQgPpg9GfLpLLKqKms'],
  marginfi: ['MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA'],
};

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, protocol } = body;

    if (!walletAddress || !protocol) {
      return NextResponse.json(
        { error: 'Missing walletAddress or protocol' },
        { status: 400 }
      );
    }

    const programIds = PROGRAM_IDS[protocol.toLowerCase()];
    
    if (!programIds || programIds.length === 0) {
      return NextResponse.json(
        { error: `Unknown protocol: ${protocol}` },
        { status: 400 }
      );
    }

    // Get UTC day bounds
    const { start: startOfDayUTC, end: endOfDayUTC, dateString } = getUTCDayBounds();

    console.log(`[check-defi] Checking ${protocol} for ${walletAddress}`);
    console.log(`[check-defi] UTC Date: ${dateString}`);
    console.log(`[check-defi] Time range: ${startOfDayUTC} - ${endOfDayUTC}`);

    // Fetch recent transactions
    const sigResponse = await fetch(RPC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [walletAddress, { limit: 100 }],
      }),
    });

    const sigData = await sigResponse.json();
    
    if (!sigData.result || !Array.isArray(sigData.result)) {
      return NextResponse.json({
        found: false,
        message: 'No transactions found',
        utcDate: dateString,
        transactionCount: 0,
      });
    }

    // Filter transactions for today (UTC)
    const todayTransactions = sigData.result.filter((sig: any) => {
      const blockTime = sig.blockTime;
      return blockTime >= startOfDayUTC && blockTime <= endOfDayUTC;
    });

    console.log(`[check-defi] Found ${todayTransactions.length} transactions today (UTC)`);

    if (todayTransactions.length === 0) {
      return NextResponse.json({
        found: false,
        message: `No transactions found today (UTC: ${dateString})`,
        utcDate: dateString,
        transactionCount: 0,
      });
    }

    // Check each transaction for protocol interaction
    const matchingTransactions: Array<{
      signature: string;
      blockTime: number;
      timestamp: string;
    }> = [];

    for (const sig of todayTransactions.slice(0, 50)) {
      try {
        const txResponse = await fetch(RPC_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTransaction',
            params: [
              sig.signature,
              { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
            ],
          }),
        });

        const txData = await txResponse.json();

        if (txData.result?.transaction?.message?.accountKeys) {
          const accountKeys = txData.result.transaction.message.accountKeys.map(
            (key: any) => (typeof key === 'string' ? key : key.pubkey)
          );

          // Check if any program ID matches
          const hasProtocolInteraction = programIds.some((pid) =>
            accountKeys.includes(pid)
          );

          if (hasProtocolInteraction) {
            matchingTransactions.push({
              signature: sig.signature,
              blockTime: sig.blockTime,
              timestamp: new Date(sig.blockTime * 1000).toISOString(),
            });
          }
        }
      } catch (txError) {
        console.error(`Error fetching transaction ${sig.signature}:`, txError);
      }
    }

    console.log(`[check-defi] Found ${matchingTransactions.length} matching ${protocol} transactions`);

    if (matchingTransactions.length > 0) {
      return NextResponse.json({
        found: true,
        message: `Found ${matchingTransactions.length} ${protocol} transaction(s) today (UTC)`,
        utcDate: dateString,
        transactionCount: matchingTransactions.length,
        transactions: matchingTransactions.slice(0, 10), // Return max 10
        latestSignature: matchingTransactions[0].signature,
      });
    }

    return NextResponse.json({
      found: false,
      message: `No ${protocol} transactions found today (UTC: ${dateString})`,
      utcDate: dateString,
      transactionCount: 0,
      totalTransactionsChecked: todayTransactions.length,
    });
  } catch (error) {
    console.error('[check-defi] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
