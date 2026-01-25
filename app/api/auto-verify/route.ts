import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Helius API
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
};

// USDC token mint
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Get UTC date string
function getUTCDateString(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

// Get UTC day start/end timestamps
function getUTCDayBounds(dateString?: string): { start: number; end: number } {
  const date = dateString ? new Date(dateString + 'T00:00:00Z') : new Date();
  
  if (!dateString) {
    // Today's bounds
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59));
    return { start: Math.floor(start.getTime() / 1000), end: Math.floor(end.getTime() / 1000) };
  }
  
  const start = new Date(date);
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  
  return { start: Math.floor(start.getTime() / 1000), end: Math.floor(end.getTime() / 1000) };
}

// Check DeFi transactions for a wallet
async function checkDeFiTransactions(
  walletAddress: string,
  protocol: string,
  startTime: number,
  endTime: number
): Promise<{ found: boolean; count: number; signatures: string[] }> {
  try {
    const programIds = PROGRAM_IDS[protocol.toLowerCase()] || [];
    
    if (programIds.length === 0) {
      return { found: false, count: 0, signatures: [] };
    }

    // Fetch transactions from Helius
    const response = await fetch(RPC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [walletAddress, { limit: 100 }],
      }),
    });

    const data = await response.json();
    
    if (!data.result || !Array.isArray(data.result)) {
      return { found: false, count: 0, signatures: [] };
    }

    // Filter by time range
    const todaySignatures = data.result.filter((sig: any) => {
      const blockTime = sig.blockTime;
      return blockTime >= startTime && blockTime <= endTime;
    });

    // Check each transaction for program interaction
    const matchingSignatures: string[] = [];
    
    for (const sig of todaySignatures.slice(0, 50)) {
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
        
        if (txData.result?.transaction?.message?.accountKeys) {
          const accountKeys = txData.result.transaction.message.accountKeys.map((k: any) => 
            typeof k === 'string' ? k : k.pubkey
          );
          
          const hasProtocol = programIds.some(pid => accountKeys.includes(pid));
          
          if (hasProtocol) {
            matchingSignatures.push(sig.signature);
          }
        }
      } catch (e) {
        console.error('Error checking transaction:', e);
      }
    }

    return {
      found: matchingSignatures.length > 0,
      count: matchingSignatures.length,
      signatures: matchingSignatures,
    };
  } catch (error) {
    console.error('Error checking DeFi transactions:', error);
    return { found: false, count: 0, signatures: [] };
  }
}

// Check savings transactions
async function checkSavingsTransactions(
  fromWallet: string,
  toWallet: string,
  tokenType: string,
  startTime: number,
  endTime: number
): Promise<{ found: boolean; count: number; totalAmount: number }> {
  try {
    const response = await fetch(RPC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [fromWallet, { limit: 100 }],
      }),
    });

    const data = await response.json();
    
    if (!data.result || !Array.isArray(data.result)) {
      return { found: false, count: 0, totalAmount: 0 };
    }

    const todaySignatures = data.result.filter((sig: any) => {
      const blockTime = sig.blockTime;
      return blockTime >= startTime && blockTime <= endTime;
    });

    let count = 0;
    let totalAmount = 0;

    for (const sig of todaySignatures.slice(0, 30)) {
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
        const instructions = txData.result?.transaction?.message?.instructions || [];

        for (const ix of instructions) {
          // Check SOL transfer
          if (tokenType === 'SOL' || tokenType === 'BOTH') {
            if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
              if (ix.parsed.info?.destination === toWallet) {
                count++;
                totalAmount += (ix.parsed.info.lamports || 0) / 1e9;
              }
            }
          }

          // Check USDC transfer
          if (tokenType === 'USDC' || tokenType === 'BOTH') {
            if (ix.program === 'spl-token' && ix.parsed?.type === 'transfer') {
              const info = ix.parsed.info;
              if (info?.mint === USDC_MINT || info?.destination?.includes(toWallet)) {
                count++;
                totalAmount += parseFloat(info.amount || '0') / 1e6;
              }
            }
          }
        }
      } catch (e) {
        console.error('Error checking savings transaction:', e);
      }
    }

    return { found: count > 0, count, totalAmount };
  } catch (error) {
    console.error('Error checking savings:', error);
    return { found: false, count: 0, totalAmount: 0 };
  }
}

// Main cron handler
export async function GET(request: NextRequest) {
  // Verify cron secret (optional but recommended)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const today = getUTCDateString();
    const { start: startTime, end: endTime } = getUTCDayBounds();
    
    console.log(`[Auto-Verify] Running for UTC date: ${today}`);
    console.log(`[Auto-Verify] Time range: ${startTime} - ${endTime}`);

    // Get all active users with their quests
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id, email, wallets')
      .eq('status', 'approved');

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    const results: any[] = [];

    for (const user of users || []) {
      // Get user's quests that are auto-verifiable and not completed today
      const { data: quests, error: questsError } = await supabase
        .from('quests')
        .select('*')
        .eq('user_id', user.id)
        .eq('auto_verify', true)
        .or(`last_verified_date.is.null,last_verified_date.neq.${today}`);

      if (questsError || !quests) continue;

      const wallets = user.wallets || [];
      
      for (const quest of quests) {
        let verified = false;
        let verificationData: any = {};

        // DeFi Quest verification
        if (quest.type === 'defi' && quest.protocol) {
          for (const wallet of wallets) {
            const result = await checkDeFiTransactions(
              wallet.address,
              quest.protocol,
              startTime,
              endTime
            );

            if (result.found) {
              verified = true;
              verificationData = {
                wallet: wallet.address,
                protocol: quest.protocol,
                transactionCount: result.count,
                signatures: result.signatures.slice(0, 5),
                verifiedAt: new Date().toISOString(),
                verifiedBy: 'auto-cron',
              };
              break;
            }
          }
        }

        // Savings Quest verification
        if (quest.type === 'savings' && quest.from_wallet && quest.to_wallet) {
          const result = await checkSavingsTransactions(
            quest.from_wallet,
            quest.to_wallet,
            quest.token_type || 'BOTH',
            startTime,
            endTime
          );

          if (result.found) {
            verified = true;
            verificationData = {
              fromWallet: quest.from_wallet,
              toWallet: quest.to_wallet,
              transferCount: result.count,
              totalAmount: result.totalAmount,
              tokenType: quest.token_type,
              verifiedAt: new Date().toISOString(),
              verifiedBy: 'auto-cron',
            };
          }
        }

        // Update quest if verified
        if (verified) {
          const { error: updateError } = await supabase
            .from('quests')
            .update({
              completed: true,
              last_verified_date: today,
              verification_data: verificationData,
              updated_at: new Date().toISOString(),
            })
            .eq('id', quest.id);

          if (!updateError) {
            // Log to quest_history
            await supabase.from('quest_history').insert({
              quest_id: quest.id,
              user_id: user.id,
              date: today,
              completed: true,
              verification_data: verificationData,
            });

            results.push({
              questId: quest.id,
              questTitle: quest.title,
              userId: user.id,
              status: 'verified',
            });
          }
        }
      }
    }

    console.log(`[Auto-Verify] Completed. Verified ${results.length} quests.`);

    return NextResponse.json({
      success: true,
      date: today,
      verifiedCount: results.length,
      results,
    });
  } catch (error) {
    console.error('[Auto-Verify] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}
