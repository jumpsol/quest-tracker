import { NextRequest, NextResponse } from 'next/server';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet') || searchParams.get('savingsWallet');
  const sourceWallet = searchParams.get('sourceWallet') || null;
  const minAmount = parseFloat(searchParams.get('minAmount') || '0');
  const tokenType = searchParams.get('tokenType') || 'SOL';

  if (!wallet) {
    return NextResponse.json({ error: 'wallet parameter required' }, { status: 400 });
  }

  return checkWallet(wallet, sourceWallet, minAmount, tokenType);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { savingsWallet, sourceWallet, minAmount = 0, tokenType = 'SOL' } = body;

    if (!savingsWallet) {
      return NextResponse.json({ error: 'savingsWallet required' }, { status: 400 });
    }

    return checkWallet(savingsWallet, sourceWallet, minAmount, tokenType);
  } catch (error: any) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

async function checkWallet(
  savingsWallet: string,
  sourceWallet: string | null,
  minAmount: number,
  tokenType: string
) {
  try {
    if (!HELIUS_API_KEY) {
      console.error('HELIUS_API_KEY not configured');
      return NextResponse.json({ 
        error: 'API not configured',
        debug: 'HELIUS_API_KEY environment variable is missing'
      }, { status: 500 });
    }

    // Get today's start timestamp (local midnight)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Math.floor(today.getTime() / 1000);

    // Fetch transactions from Helius
    const heliusUrl = `https://api.helius.xyz/v0/addresses/${savingsWallet}/transactions?api-key=${HELIUS_API_KEY}&limit=100`;
    
    const response = await fetch(heliusUrl);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Helius API error:', response.status, errorText);
      return NextResponse.json({ 
        error: 'Failed to fetch transactions',
        debug: `Helius returned ${response.status}`
      }, { status: 502 });
    }

    const transactions = await response.json();

    if (!Array.isArray(transactions)) {
      return NextResponse.json({
        success: true,
        isCompleted: false,
        todayStats: { transferCount: 0, totalSOL: '0.0000', totalUSDC: '0.00' },
        transactions: [],
        debug: 'No transactions found'
      });
    }

    let totalSOL = 0;
    let totalUSDC = 0;
    const txDetails: any[] = [];

    for (const tx of transactions) {
      // Skip if before today
      if (tx.timestamp < todayTimestamp) continue;

      // Check SOL transfers
      if (tokenType === 'SOL' || tokenType === 'BOTH') {
        const nativeTransfers = tx.nativeTransfers || [];
        for (const transfer of nativeTransfers) {
          if (transfer.toUserAccount === savingsWallet) {
            const isFromSource = sourceWallet ? transfer.fromUserAccount === sourceWallet : true;
            if (isFromSource && transfer.amount > 0) {
              const amount = transfer.amount / 1e9;
              totalSOL += amount;
              txDetails.push({
                signature: tx.signature,
                type: 'SOL',
                amount,
                from: transfer.fromUserAccount,
                timestamp: tx.timestamp
              });
            }
          }
        }
      }

      // Check USDC transfers
      if (tokenType === 'USDC' || tokenType === 'BOTH') {
        const tokenTransfers = tx.tokenTransfers || [];
        for (const transfer of tokenTransfers) {
          if (transfer.toUserAccount === savingsWallet && transfer.mint === USDC_MINT) {
            const isFromSource = sourceWallet ? transfer.fromUserAccount === sourceWallet : true;
            if (isFromSource && transfer.tokenAmount > 0) {
              totalUSDC += transfer.tokenAmount;
              txDetails.push({
                signature: tx.signature,
                type: 'USDC',
                amount: transfer.tokenAmount,
                from: transfer.fromUserAccount,
                timestamp: tx.timestamp
              });
            }
          }
        }
      }
    }

    // Determine completion
    let isCompleted = false;
    if (tokenType === 'SOL') {
      isCompleted = totalSOL >= minAmount;
    } else if (tokenType === 'USDC') {
      isCompleted = totalUSDC >= minAmount;
    } else if (tokenType === 'BOTH') {
      isCompleted = totalSOL >= minAmount || totalUSDC >= minAmount;
    }

    return NextResponse.json({
      success: true,
      isCompleted,
      todayStats: {
        transferCount: txDetails.length,
        totalSOL: totalSOL.toFixed(4),
        totalUSDC: totalUSDC.toFixed(2),
      },
      transactions: txDetails,
      checkedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Check wallet error:', error);
    return NextResponse.json({
      success: false,
      isCompleted: false,
      error: error.message,
      todayStats: { transferCount: 0, totalSOL: '0.0000', totalUSDC: '0.00' },
      transactions: []
    }, { status: 500 });
  }
}
