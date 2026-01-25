import { NextRequest, NextResponse } from 'next/server';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { savingsWallet, sourceWallet, minAmount = 0, tokenType } = body;
    
    // Default to SOL if tokenType is null/undefined
    const effectiveTokenType = tokenType || 'SOL';

    console.log('Check wallet request:', { savingsWallet, sourceWallet, minAmount, tokenType: effectiveTokenType });

    if (!savingsWallet) {
      return NextResponse.json({ error: 'Savings wallet address required' }, { status: 400 });
    }

    if (!HELIUS_API_KEY) {
      console.error('HELIUS_API_KEY is not set');
      return NextResponse.json({ error: 'API configuration error' }, { status: 500 });
    }

    // Get today's start timestamp - use LOCAL midnight (user's perspective)
    // For more accuracy, we check last 24 hours instead of strict UTC midnight
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0); // Local midnight
    const todayTimestamp = Math.floor(todayStart.getTime() / 1000);
    
    console.log('Today timestamp (local midnight):', todayTimestamp, new Date(todayTimestamp * 1000).toISOString());

    // Fetch transactions using Helius Enhanced API
    const heliusUrl = `https://api.helius.xyz/v0/addresses/${savingsWallet}/transactions?api-key=${HELIUS_API_KEY}&limit=100`;
    
    const response = await fetch(heliusUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Helius API error:', response.status, errorText);
      throw new Error(`Helius API error: ${response.status}`);
    }

    const transactions = await response.json();
    
    console.log(`Fetched ${transactions?.length || 0} transactions from Helius`);

    if (!Array.isArray(transactions)) {
      console.error('Invalid response from Helius:', transactions);
      return NextResponse.json({
        success: true,
        isCompleted: false,
        todayStats: { transferCount: 0, totalSOL: '0.0000', totalUSDC: '0.00' },
        transactions: [],
        checkedAt: new Date().toISOString(),
        debug: 'No transactions array returned'
      });
    }

    // Calculate total amount transferred today
    let totalSOL = 0;
    let totalUSDC = 0;
    const txDetails: any[] = [];

    // Filter today's incoming transfers
    for (const tx of transactions) {
      const txTimestamp = tx.timestamp;
      
      // Skip transactions before today
      if (txTimestamp < todayTimestamp) {
        continue;
      }

      // Check for native SOL transfers
      if (effectiveTokenType === 'SOL' || effectiveTokenType === 'BOTH') {
        const nativeTransfers = tx.nativeTransfers || [];
        for (const transfer of nativeTransfers) {
          // Check if this is an incoming transfer to savings wallet
          if (transfer.toUserAccount === savingsWallet) {
            // If source wallet specified, verify it matches
            const isFromSource = sourceWallet ? transfer.fromUserAccount === sourceWallet : true;
            
            if (isFromSource && transfer.amount > 0) {
              const amount = transfer.amount / 1e9; // Convert lamports to SOL
              totalSOL += amount;
              txDetails.push({
                signature: tx.signature,
                type: 'SOL',
                amount: amount,
                from: transfer.fromUserAccount,
                timestamp: tx.timestamp,
                description: tx.description || 'SOL Transfer'
              });
              console.log(`Found SOL transfer: ${amount} SOL from ${transfer.fromUserAccount}`);
            }
          }
        }
      }

      // Check for USDC transfers
      if (effectiveTokenType === 'USDC' || effectiveTokenType === 'BOTH') {
        const tokenTransfers = tx.tokenTransfers || [];
        for (const transfer of tokenTransfers) {
          // Check if this is an incoming transfer to savings wallet
          if (transfer.toUserAccount === savingsWallet) {
            // USDC mint address on Solana mainnet
            const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
            
            if (transfer.mint === USDC_MINT) {
              // If source wallet specified, verify it matches
              const isFromSource = sourceWallet ? transfer.fromUserAccount === sourceWallet : true;
              
              if (isFromSource && transfer.tokenAmount > 0) {
                const amount = transfer.tokenAmount;
                totalUSDC += amount;
                txDetails.push({
                  signature: tx.signature,
                  type: 'USDC',
                  amount: amount,
                  from: transfer.fromUserAccount,
                  timestamp: tx.timestamp,
                  description: 'USDC Transfer'
                });
                console.log(`Found USDC transfer: ${amount} USDC from ${transfer.fromUserAccount}`);
              }
            }
          }
        }
      }
    }

    // Determine if quest is completed based on token type
    let isCompleted = false;
    const minAmountNum = Number(minAmount) || 0;
    
    if (effectiveTokenType === 'SOL') {
      isCompleted = totalSOL >= minAmountNum;
    } else if (effectiveTokenType === 'USDC') {
      isCompleted = totalUSDC >= minAmountNum;
    } else if (effectiveTokenType === 'BOTH') {
      // Either SOL or USDC meets the minimum
      isCompleted = totalSOL >= minAmountNum || totalUSDC >= minAmountNum;
    }

    console.log('Quest completion check:', {
      effectiveTokenType,
      totalSOL,
      totalUSDC,
      minAmountNum,
      isCompleted,
      txCount: txDetails.length
    });

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
    console.error('Error checking wallet:', error);
    return NextResponse.json({ 
      success: false,
      isCompleted: false,
      error: error.message || 'Failed to check wallet',
      todayStats: { transferCount: 0, totalSOL: '0.0000', totalUSDC: '0.00' },
      transactions: []
    }, { status: 500 });
  }
}

// Also support GET for testing
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const savingsWallet = searchParams.get('savingsWallet') || searchParams.get('wallet');
  
  if (!savingsWallet) {
    return NextResponse.json({ error: 'wallet parameter required' }, { status: 400 });
  }
  
  // Create a mock request and call POST
  const mockRequest = {
    json: async () => ({
      savingsWallet,
      sourceWallet: searchParams.get('sourceWallet'),
      minAmount: parseFloat(searchParams.get('minAmount') || '0'),
      tokenType: searchParams.get('tokenType') || 'SOL'
    })
  } as NextRequest;
  
  return POST(mockRequest);
}
