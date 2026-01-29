import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || 'fdeec242-8b73-41cd-b9e3-3ca680a2afc5';
const RPC_ENDPOINT = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Protocol program IDs
const PROTOCOL_PROGRAMS: Record<string, string[]> = {
  jupiter: ['JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB'],
  titan: ['TITAN4XKzzfMEVLLR2NLhq8bQ1T9WqFHtPGhnGSfVLhE', 'TITANfbGTVU6rL7cNgNjsK5T8Y2qvCXwkZEuZjJwJhK'],
  meteora: ['LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo'],
  raydium: ['675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK'],
  orca: ['whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP'],
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

// Get transaction and check if it interacts with protocol
async function checkTransactionForProtocol(signature: string, protocol: string): Promise<boolean> {
  try {
    const response = await fetch(RPC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
      }),
    });
    
    const data = await response.json();
    const tx = data.result;
    
    if (!tx?.transaction?.message?.accountKeys) {
      return false;
    }

    const accountKeys = tx.transaction.message.accountKeys;
    const programIds = PROTOCOL_PROGRAMS[protocol] || [];
    
    // Check if any of the protocol's program IDs are in the transaction
    for (const account of accountKeys) {
      const pubkey = account.pubkey || account;
      if (programIds.some(pid => pubkey.includes(pid.substring(0, 20)))) {
        return true;
      }
    }

    // Also check in instructions
    const instructions = tx.transaction.message.instructions || [];
    for (const ix of instructions) {
      if (ix.programId && programIds.some(pid => ix.programId.includes(pid.substring(0, 20)))) {
        return true;
      }
    }

    // Check log messages for protocol mentions
    const logMessages = tx.meta?.logMessages || [];
    const protocolKeywords = [protocol, ...programIds.map(p => p.substring(0, 10))];
    for (const log of logMessages) {
      if (protocolKeywords.some(kw => log.toLowerCase().includes(kw.toLowerCase()))) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking transaction:', error);
    return false;
  }
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
        const isProtocolTx = await checkTransactionForProtocol(sig.signature, protocol);
        
        if (isProtocolTx) {
          dayTxCount++;
          if (!firstSignature) {
            firstSignature = sig.signature;
          }
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
