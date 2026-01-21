import { NextRequest, NextResponse } from 'next/server';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const { savingsWallet, sourceWallet, minAmount } = await request.json();

    if (!savingsWallet) {
      return NextResponse.json({ error: 'Savings wallet address required' }, { status: 400 });
    }

    // Get today's start timestamp (UTC)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayTimestamp = Math.floor(today.getTime() / 1000);

    // Fetch transactions using Helius Enhanced API
    const response = await fetch(
      `https://api.helius.xyz/v0/addresses/${savingsWallet}/transactions?api-key=${HELIUS_API_KEY}&limit=50`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch transactions from Helius');
    }

    const transactions = await response.json();

    // Filter today's incoming transfers
    const todayTransfers = transactions.filter((tx: any) => {
      const txTimestamp = tx.timestamp;
      if (txTimestamp < todayTimestamp) return false;

      // Check for native SOL transfers
      const nativeTransfers = tx.nativeTransfers || [];
      const hasIncomingSOL = nativeTransfers.some((transfer: any) => {
        const isToSavings = transfer.toUserAccount === savingsWallet;
        const isFromSource = sourceWallet ? transfer.fromUserAccount === sourceWallet : true;
        const meetsMinAmount = minAmount ? (transfer.amount / 1e9) >= minAmount : true;
        return isToSavings && isFromSource && meetsMinAmount;
      });

      // Check for token transfers (SPL tokens)
      const tokenTransfers = tx.tokenTransfers || [];
      const hasIncomingToken = tokenTransfers.some((transfer: any) => {
        const isToSavings = transfer.toUserAccount === savingsWallet;
        const isFromSource = sourceWallet ? transfer.fromUserAccount === sourceWallet : true;
        return isToSavings && isFromSource;
      });

      return hasIncomingSOL || hasIncomingToken;
    });

    // Calculate total amount transferred today
    let totalSOL = 0;
    let totalUSDC = 0;
    const txDetails: any[] = [];

    todayTransfers.forEach((tx: any) => {
      const nativeTransfers = tx.nativeTransfers || [];
      nativeTransfers.forEach((transfer: any) => {
        if (transfer.toUserAccount === savingsWallet) {
          const amount = transfer.amount / 1e9;
          totalSOL += amount;
          txDetails.push({
            signature: tx.signature,
            type: 'SOL',
            amount: amount,
            from: transfer.fromUserAccount,
            timestamp: tx.timestamp,
            description: tx.description || 'SOL Transfer'
          });
        }
      });

      const tokenTransfers = tx.tokenTransfers || [];
      tokenTransfers.forEach((transfer: any) => {
        if (transfer.toUserAccount === savingsWallet) {
          if (transfer.mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') {
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
          }
        }
      });
    });

    const isCompleted = todayTransfers.length > 0 && 
      (minAmount ? totalSOL >= minAmount : true);

    return NextResponse.json({
      success: true,
      isCompleted,
      todayStats: {
        transferCount: todayTransfers.length,
        totalSOL: totalSOL.toFixed(4),
        totalUSDC: totalUSDC.toFixed(2),
      },
      transactions: txDetails,
      checkedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Error checking wallet:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to check wallet' 
    }, { status: 500 });
  }
}
