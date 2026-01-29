import { NextRequest, NextResponse } from 'next/server';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || 'fdeec242-8b73-41cd-b9e3-3ca680a2afc5';
const RPC_ENDPOINT = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// Protocol identifiers - includes program IDs AND frontend/router addresses
const PROTOCOL_IDENTIFIERS: Record<string, string[]> = {
  titan: [
    'T1TANpTeScyeqVzzgNViGDNrkQ6qHz9KrSBS4aNXvGT',
    'jitodontfronttitans',  // Jito Titan frontend marker
    'titan',  // Log message keyword
  ],
  jupiter: [
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
    'jitodontfront',  // General Jito frontend (but NOT titans)
    'JustUseJupiter',
  ],
  meteora: [
    'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
    'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB',
  ],
  raydium: [
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
    'routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS',
  ],
  orca: [
    'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
    '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',
  ],
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

// Check if transaction belongs to a specific protocol
function checkTransactionForProtocol(txData: any, protocol: string): boolean {
  if (!txData?.transaction?.message?.accountKeys) {
    return false;
  }

  const identifiers = PROTOCOL_IDENTIFIERS[protocol] || [];
  if (identifiers.length === 0) return false;

  // Get all account keys as strings
  const accountKeys = txData.transaction.message.accountKeys.map((a: any) => a.pubkey || a);
  
  // Check account keys
  for (const key of accountKeys) {
    for (const identifier of identifiers) {
      if (key.includes(identifier)) {
        // Special case: for Jupiter, exclude if it's actually a Titan transaction
        if (protocol === 'jupiter' && key.includes('titans')) {
          continue;
        }
        console.log(`[check-defi] Found ${protocol} identifier: ${identifier} in ${key}`);
        return true;
      }
    }
  }

  // Check log messages
  const logMessages = txData.meta?.logMessages || [];
  for (const log of logMessages) {
    const logLower = log.toLowerCase();
    for (const identifier of identifiers) {
      if (logLower.includes(identifier.toLowerCase())) {
        // Special case for Jupiter vs Titan
        if (protocol === 'jupiter' && logLower.includes('titan')) {
          continue;
        }
        console.log(`[check-defi] Found ${protocol} in log: ${identifier}`);
        return true;
      }
    }
  }

  return false;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, protocol } = body;

    if (!walletAddress) {
      return NextResponse.json({ error: 'Missing walletAddress' }, { status: 400 });
    }

    const protocolLower = (protocol || 'jupiter').toLowerCase();
    const { start: startOfDayUTC, end: endOfDayUTC, dateString } = getUTCDayBounds();

    console.log(`[check-defi] Checking wallet: ${walletAddress}`);
    console.log(`[check-defi] Protocol: ${protocolLower}`);
    console.log(`[check-defi] UTC Date: ${dateString}`);

    // Fetch recent transactions
    const sigResponse = await fetch(RPC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [walletAddress, { limit: 50 }],
      }),
    });

    const sigData = await sigResponse.json();

    if (!sigData.result || !Array.isArray(sigData.result)) {
      return NextResponse.json({
        found: false,
        message: 'No transactions found',
        utcDate: dateString,
        transactionCount: 0,
        totalTransactionsChecked: 0,
      });
    }

    // Filter transactions for today (UTC)
    const todaySignatures = sigData.result.filter((sig: any) => {
      const blockTime = sig.blockTime;
      return blockTime >= startOfDayUTC && blockTime <= endOfDayUTC;
    });

    console.log(`[check-defi] Found ${todaySignatures.length} transactions today (UTC)`);

    if (todaySignatures.length === 0) {
      return NextResponse.json({
        found: false,
        message: `No transactions found today (UTC: ${dateString})`,
        utcDate: dateString,
        transactionCount: 0,
        totalTransactionsChecked: sigData.result.length,
      });
    }

    // Check each transaction for protocol
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
        
        if (checkTransactionForProtocol(txData.result, protocolLower)) {
          matchingTransactions.push({
            signature: sig.signature,
            blockTime: sig.blockTime,
          });
        }
      } catch (txError) {
        console.error(`[check-defi] Error processing tx ${sig.signature}:`, txError);
      }
    }

    console.log(`[check-defi] Found ${matchingTransactions.length} ${protocolLower} transactions`);

    const found = matchingTransactions.length > 0;

    return NextResponse.json({
      found,
      message: found 
        ? `Found ${matchingTransactions.length} ${protocolLower} transaction(s) today (UTC)` 
        : `No ${protocolLower} transactions found today (UTC: ${dateString})`,
      utcDate: dateString,
      transactionCount: matchingTransactions.length,
      transactions: matchingTransactions.slice(0, 5),
      totalTransactionsChecked: todaySignatures.length,
    });

  } catch (error) {
    console.error('[check-defi] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
