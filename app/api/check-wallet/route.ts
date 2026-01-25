import { NextRequest, NextResponse } from 'next/server';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

// DeFi Platform Program IDs
const PROGRAM_IDS: Record<string, string> = {
  titan: 'T1TANpTeScyeqVzzgNViGDNrkQ6qHz9KrSBS4aNXvGT',
  jupiter: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  meteora: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
  raydium: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  orca: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wallets = searchParams.get('wallets') || searchParams.get('wallet');
  const programId = searchParams.get('programId');
  const platform = searchParams.get('platform');
  const action = searchParams.get('action') || 'any';
  const minAmount = parseFloat(searchParams.get('minAmount') || '0');

  if (!wallets) {
    return NextResponse.json({ error: 'wallets parameter required' }, { status: 400 });
  }

  const effectiveProgramId = programId || (platform ? PROGRAM_IDS[platform] : null);

  return checkDefi(wallets, effectiveProgramId, action, minAmount);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { wallets, programId, action = 'any', minAmount = 0 } = body;

    if (!wallets) {
      return NextResponse.json({ error: 'wallets required' }, { status: 400 });
    }

    return checkDefi(wallets, programId, action, minAmount);
  } catch (error: any) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

async function checkDefi(
  walletsStr: string,
  programId: string | null,
  action: string,
  minAmount: number
) {
  try {
    if (!HELIUS_API_KEY) {
      return NextResponse.json({ 
        error: 'API not configured',
        debug: 'HELIUS_API_KEY missing'
      }, { status: 500 });
    }

    // Parse wallet addresses
    const wallets = walletsStr.split(',').map(w => w.trim()).filter(Boolean);
    
    if (wallets.length === 0) {
      return NextResponse.json({ error: 'No valid wallets provided' }, { status: 400 });
    }

    // Get today's timestamp
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Math.floor(today.getTime() / 1000);

    let allTxDetails: any[] = [];
    let totalVolume = 0;

    // Check each wallet
    for (const wallet of wallets) {
      try {
        const heliusUrl = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${HELIUS_API_KEY}&limit=100`;
        const response = await fetch(heliusUrl);

        if (!response.ok) {
          console.error(`Helius error for ${wallet}:`, response.status);
          continue;
        }

        const transactions = await response.json();

        if (!Array.isArray(transactions)) continue;

        for (const tx of transactions) {
          // Skip if before today
          if (tx.timestamp < todayTimestamp) continue;

          // Check if transaction involves the target program
          let matchesProgram = true;
          if (programId) {
            const accountKeys = tx.accountData?.map((a: any) => a.account) || [];
            const instructions = tx.instructions || [];
            
            matchesProgram = accountKeys.includes(programId) || 
                            instructions.some((i: any) => i.programId === programId) ||
                            tx.source === programId;
          }

          if (!matchesProgram) continue;

          // Check action type
          let matchesAction = true;
          if (action && action !== 'any') {
            const txType = (tx.type || '').toUpperCase();
            const txSource = (tx.source || '').toUpperCase();
            
            if (action === 'swap') {
              matchesAction = txType.includes('SWAP') || txSource.includes('SWAP');
            } else if (action === 'add_lp') {
              matchesAction = txType.includes('ADD') || txType.includes('DEPOSIT') || txType.includes('LIQUIDITY');
            } else if (action === 'remove_lp') {
              matchesAction = txType.includes('REMOVE') || txType.includes('WITHDRAW');
            } else if (action === 'stake') {
              matchesAction = txType.includes('STAKE');
            }
          }

          if (!matchesAction) continue;

          // Calculate volume from native transfers
          let txVolume = 0;
          const nativeTransfers = tx.nativeTransfers || [];
          for (const transfer of nativeTransfers) {
            if (transfer.fromUserAccount === wallet || transfer.toUserAccount === wallet) {
              txVolume += Math.abs(transfer.amount) / 1e9;
            }
          }

          // Also check token transfers
          const tokenTransfers = tx.tokenTransfers || [];
          for (const transfer of tokenTransfers) {
            if (transfer.fromUserAccount === wallet || transfer.toUserAccount === wallet) {
              txVolume += transfer.tokenAmount || 0;
            }
          }

          totalVolume += txVolume;

          allTxDetails.push({
            signature: tx.signature,
            wallet,
            type: tx.type || 'UNKNOWN',
            source: tx.source,
            volume: txVolume,
            timestamp: tx.timestamp,
            description: tx.description || ''
          });
        }
      } catch (err) {
        console.error(`Error checking wallet ${wallet}:`, err);
      }
    }

    // Determine completion
    const isCompleted = allTxDetails.length > 0 && (minAmount === 0 || totalVolume >= minAmount);

    return NextResponse.json({
      success: true,
      isCompleted,
      txCount: allTxDetails.length,
      totalVolume: totalVolume.toFixed(4),
      transactions: allTxDetails.slice(0, 10), // Return max 10 transactions
      walletsChecked: wallets.length,
      checkedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Check DeFi error:', error);
    return NextResponse.json({
      success: false,
      isCompleted: false,
      error: error.message,
      txCount: 0,
      transactions: []
    }, { status: 500 });
  }
}
