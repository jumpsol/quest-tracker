import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || 'fdeec242-8b73-41cd-b9e3-3ca680a2afc5';
const RPC_ENDPOINT = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

// Convert blockTime to UTC date string
function blockTimeToUTCDate(blockTime: number): string {
  const date = new Date(blockTime * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

// Get all signatures for an address
async function getAllSignatures(address: string, limit: number = 200): Promise<any[]> {
  try {
    const response = await fetch(RPC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [address, { limit }],
      }),
    });
    
    const data = await response.json();
    return data.result || [];
  } catch (error) {
    console.error('Error getting signatures:', error);
    return [];
  }
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
        return true;
      }
    }
  }

  return false;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, questId, walletAddress, protocol } = body;

    if (!questId || !walletAddress || !userId || !protocol) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Initialize Supabase with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[backfill-defi] Checking wallet: ${walletAddress} for protocol: ${protocol}`);

    // Get all signatures
    const signatures = await getAllSignatures(walletAddress, 200);
    console.log(`[backfill-defi] Found ${signatures.length} total signatures`);

    // Group signatures by UTC date
    const signaturesByDate: Record<string, any[]> = {};
    
    for (const sig of signatures) {
      const utcDate = blockTimeToUTCDate(sig.blockTime);
      if (!signaturesByDate[utcDate]) {
        signaturesByDate[utcDate] = [];
      }
      signaturesByDate[utcDate].push(sig);
    }

    // Process each date to find protocol transactions
    const datesWithTransactions: { date: string; txCount: number; signature: string }[] = [];

    for (const [date, sigs] of Object.entries(signaturesByDate)) {
      let dayTxCount = 0;
      let firstSignature = '';

      // Check up to 10 transactions per day (to avoid rate limits)
      for (const sig of sigs.slice(0, 10)) {
        try {
          // Fetch transaction data
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
          
          if (checkTransactionForProtocol(txData.result, protocol)) {
            dayTxCount++;
            if (!firstSignature) {
              firstSignature = sig.signature;
            }
          }
        } catch (error) {
          console.error(`[backfill-defi] Error checking tx ${sig.signature}:`, error);
        }
      }

      if (dayTxCount > 0) {
        datesWithTransactions.push({
          date,
          txCount: dayTxCount,
          signature: firstSignature,
        });
      }
    }

    console.log(`[backfill-defi] Found ${datesWithTransactions.length} dates with ${protocol} transactions`);

    // Get existing completions for this quest
    const { data: existingCompletions } = await supabase
      .from('quest_completions')
      .select('completed_date')
      .eq('quest_id', questId);

    const existingDates = new Set(existingCompletions?.map(c => c.completed_date) || []);

    // Insert missing completions
    const newCompletions = datesWithTransactions
      .filter(t => !existingDates.has(t.date))
      .map(t => ({
        user_id: userId,
        quest_id: questId,
        completed_date: t.date,
        auto_verified: true,
        tx_signature: t.signature,
      }));

    if (newCompletions.length > 0) {
      const { error } = await supabase
        .from('quest_completions')
        .insert(newCompletions);

      if (error) {
        console.error('[backfill-defi] Error inserting completions:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      console.log(`[backfill-defi] Inserted ${newCompletions.length} new completions`);
    }

    return NextResponse.json({
      success: true,
      message: `Found ${datesWithTransactions.length} dates with ${protocol} transactions`,
      datesFound: datesWithTransactions.map(t => ({ date: t.date, txCount: t.txCount })),
      newCompletionsAdded: newCompletions.length,
      alreadyExisted: datesWithTransactions.length - newCompletions.length,
      protocol,
    });

  } catch (error) {
    console.error('[backfill-defi] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
