import { NextRequest, NextResponse } from 'next/server';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wallets = searchParams.get('wallets') || searchParams.get('wallet');
  const programId = searchParams.get('programId');
  const action = searchParams.get('action') || 'any';
  const minAmount = parseFloat(searchParams.get('minAmount') || '0');

  if (!wallets) {
    return NextResponse.json({ error: 'wallets parameter required' }, { status: 400 });
  }

  return checkDefi(wallets, programId, action, minAmount);
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
      return NextResponse.json({ error: 'API not configured' }, { status: 500 });
    }

    const wallets = walletsStr.split(',').map(w => w.trim()).filter(Boolean);
    
    if (wallets.length === 0) {
      return NextResponse.json({ error: 'No valid wallets' }, { status: 400 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Math.floor(today.getTime() / 1000);

    let allTxDetails: any[] = [];
    let totalVolume = 0;

    for (const wallet of wallets) {
      try {
        const url = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${HELIUS_API_KEY}&limit=100`;
        const response = await fetch(url);

        if (!response.ok) continue;

        const transactions = await response.json();
        if (!Array.isArray(transactions)) continue;

        for (const tx of transactions) {
          if (tx.timestamp < todayTimestamp) continue;

          let matchesProgram = true;
          if (programId) {
            const accounts = tx.accountData?.map((a: any) => a.account) || [];
            matchesProgram = accounts.includes(programId) || 
                            tx.instructions?.some((i: any) => i.programId === programId);
          }

          if (!matchesProgram) continue;

          let matchesAction = true;
          if (action && action !== 'any') {
            const txType = (tx.type || '').toUpperCase();
            if (action === 'swap') matchesAction = txType.includes('SWAP');
            else if (action === 'add_lp') matchesAction = txType.includes('ADD') || txType.includes('DEPOSIT');
            else if (action === 'remove_lp') matchesAction = txType.includes('REMOVE') || txType.includes('WITHDRAW');
            else if (action === 'stake') matchesAction = txType.includes('STAKE');
          }

          if (!matchesAction) continue;

          let txVolume = 0;
          for (const t of tx.nativeTransfers || []) {
            if (t.fromUserAccount === wallet || t.toUserAccount === wallet) {
              txVolume += Math.abs(t.amount) / 1e9;
            }
          }

          totalVolume += txVolume;
          allTxDetails.push({
            signature: tx.signature,
            wallet,
            type: tx.type || 'UNKNOWN',
            timestamp: tx.timestamp
          });
        }
      } catch (err) {
        console.error(`Error for ${wallet}:`, err);
      }
    }

    const isCompleted = allTxDetails.length > 0 && (minAmount === 0 || totalVolume >= minAmount);

    return NextResponse.json({
      success: true,
      isCompleted,
      txCount: allTxDetails.length,
      totalVolume: totalVolume.toFixed(4),
      transactions: allTxDetails.slice(0, 10),
      checkedAt: new Date().toISOString()
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      isCompleted: false,
      error: error.message,
      txCount: 0,
      transactions: []
    }, { status: 500 });
  }
}
