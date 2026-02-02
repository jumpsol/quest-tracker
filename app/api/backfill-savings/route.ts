import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || 'fdeec242-8b73-41cd-b9e3-3ca680a2afc5';
const RPC_ENDPOINT = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
    console.error('Error getting token account:', error);
    return null;
  }
}

// Get all signatures for an address
async function getAllSignatures(address: string, limit: number = 100): Promise<any[]> {
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

// Get transaction details
async function getTransaction(signature: string): Promise<any> {
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
    return data.result;
  } catch (error) {
    console.error('Error getting transaction:', error);
    return null;
  }
}

// Convert blockTime to UTC date string
function blockTimeToUTCDate(blockTime: number): string {
  const date = new Date(blockTime * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { visitorId, questId, savingsWallet, sourceWallet, minAmount = 0, tokenType = 'USDC' } = body;

    if (!questId || !savingsWallet || !visitorId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Initialize Supabase with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get USDC token account
    const usdcTokenAccount = await getUSDCTokenAccount(savingsWallet);
    
    if (!usdcTokenAccount && (tokenType === 'USDC' || tokenType === 'BOTH')) {
      return NextResponse.json({ error: 'No USDC token account found' }, { status: 400 });
    }

    // Collect addresses to check
    const addressesToCheck: string[] = [savingsWallet];
    if (usdcTokenAccount) {
      addressesToCheck.push(usdcTokenAccount);
    }

    // Get all signatures from all addresses
    let allSignatures: any[] = [];
    for (const address of addressesToCheck) {
      const sigs = await getAllSignatures(address, 200);
      allSignatures = [...allSignatures, ...sigs];
    }

    // Remove duplicates
    const uniqueSignatures = Array.from(
      new Map(allSignatures.map(s => [s.signature, s])).values()
    );

    console.log(`[backfill] Found ${uniqueSignatures.length} unique signatures`);

    // Group signatures by UTC date
    const signaturesByDate: Record<string, any[]> = {};
    
    for (const sig of uniqueSignatures) {
      const utcDate = blockTimeToUTCDate(sig.blockTime);
      if (!signaturesByDate[utcDate]) {
        signaturesByDate[utcDate] = [];
      }
      signaturesByDate[utcDate].push(sig);
    }

    // Process each date to find USDC transfers
    const datesWithTransfers: { date: string; totalUSDC: number; signature: string }[] = [];

    for (const [date, signatures] of Object.entries(signaturesByDate)) {
      let dayTotalUSDC = 0;
      let firstSignature = '';

      for (const sig of signatures) {
        const txData = await getTransaction(sig.signature);
        
        if (!txData?.transaction?.message?.instructions) {
          continue;
        }

        const postBalances = txData.meta?.postTokenBalances || [];
        const preBalances = txData.meta?.preTokenBalances || [];

        // Check if savings wallet received USDC
        let receivedAmount = 0;
        for (const post of postBalances) {
          if (post.owner === savingsWallet && post.mint === USDC_MINT) {
            const pre = preBalances.find((p: any) => 
              p.owner === savingsWallet && p.mint === USDC_MINT
            );
            const preAmount = pre?.uiTokenAmount?.uiAmount || 0;
            const postAmount = post.uiTokenAmount?.uiAmount || 0;
            receivedAmount = postAmount - preAmount;
            break;
          }
        }

        if (receivedAmount > 0) {
          // Check source wallet if specified
          if (sourceWallet) {
            const fromSourceWallet = preBalances.some((balance: any) => {
              return balance.owner === sourceWallet && balance.mint === USDC_MINT;
            });
            
            const signers = txData.transaction.message.accountKeys
              ?.filter((k: any) => k.signer)
              ?.map((k: any) => k.pubkey) || [];
            
            const isFromSource = fromSourceWallet || signers.includes(sourceWallet);
            
            if (!isFromSource) {
              continue;
            }
          }

          dayTotalUSDC += receivedAmount;
          if (!firstSignature) {
            firstSignature = sig.signature;
          }
        }
      }

      if (dayTotalUSDC >= minAmount && dayTotalUSDC > 0) {
        datesWithTransfers.push({
          date,
          totalUSDC: dayTotalUSDC,
          signature: firstSignature,
        });
      }
    }

    console.log(`[backfill] Found ${datesWithTransfers.length} dates with qualifying transfers`);

    // Get existing completions for this quest
    const { data: existingCompletions } = await supabase
      .from('quest_completions')
      .select('completed_date')
      .eq('quest_id', questId);

    const existingDates = new Set(existingCompletions?.map(c => c.completed_date) || []);

    // Insert missing completions
    const newCompletions = datesWithTransfers
      .filter(t => !existingDates.has(t.date))
      .map(t => ({
        user_id: visitorId,
        quest_id: questId,
        completed_date: t.date,
        auto_verified: true,
        tx_signature: t.signature,
      }));

    if (newCompletions.length > 0) {
      const { data, error } = await supabase
        .from('quest_completions')
        .insert(newCompletions)
        .select();

      if (error) {
        console.error('[backfill] Error inserting completions:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      console.log(`[backfill] Inserted ${newCompletions.length} new completions`);
    }

    return NextResponse.json({
      success: true,
      message: `Found ${datesWithTransfers.length} dates with transfers, added ${newCompletions.length} new completions`,
      datesFound: datesWithTransfers.map(t => ({ 
        date: t.date, 
        amount: parseFloat(t.totalUSDC.toFixed(2)),
        tokenType: 'USDC'
      })),
      newCompletionsAdded: newCompletions.length,
      alreadyExisted: datesWithTransfers.length - newCompletions.length,
    });

  } catch (error) {
    console.error('[backfill] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
