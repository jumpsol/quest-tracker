import { NextRequest, NextResponse } from 'next/server';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const { wallets, programId, action, minAmount } = await request.json();

    if (!wallets) {
      return NextResponse.json({ error: 'Wallet addresses required' }, { status: 400 });
    }

    // Parse multiple wallets (comma separated)
    const walletList = wallets.split(',').map((w: string) => w.trim()).filter((w: string) => w);

    if (walletList.length === 0) {
      return NextResponse.json({ error: 'At least one wallet address required' }, { status: 400 });
    }

    // Get today's start timestamp (UTC)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayTimestamp = Math.floor(today.getTime() / 1000);

    // Action type mapping
    const actionTypes: Record<string, string[]> = {
      'swap': ['SWAP'],
      'add_lp': ['ADD_LIQUIDITY', 'DEPOSIT'],
      'remove_lp': ['REMOVE_LIQUIDITY', 'WITHDRAW'],
      'stake': ['STAKE'],
      'any': []
    };

    const validTypes = actionTypes[action] || [];
    let allTxDetails: any[] = [];
    let totalTxCount = 0;

    // Check each wallet
    for (const wallet of walletList) {
      try {
        const response = await fetch(
          `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${HELIUS_API_KEY}&limit=50`
        );

        if (!response.ok) continue;

        const transactions = await response.json();

        // Filter today's transactions that match criteria
        const matchingTx = transactions.filter((tx: any) => {
          // Check timestamp
          if (tx.timestamp < todayTimestamp) return false;

          // Check if transaction involves the target program
          if (programId) {
            const accountKeys = tx.accountData?.map((a: any) => a.account) || [];
            const instructions = tx.instructions || [];
            
            // Check account keys
            const hasProgram = accountKeys.includes(programId);
            
            // Check instruction program IDs
            const hasProgramInstructions = instructions.some((inst: any) => 
              inst.programId === programId
            );

            if (!hasProgram && !hasProgramInstructions) return false;
          }

          // Check action type if specified
          if (validTypes.length > 0) {
            const txType = tx.type || '';
            const txDescription = tx.description || '';
            
            const matchesType = validTypes.some(t => 
              txType.toUpperCase().includes(t) || 
              txDescription.toUpperCase().includes(t)
            );
            
            if (!matchesType) return false;
          }

          return true;
        });

        // Add matching transactions to results
        matchingTx.forEach((tx: any) => {
          totalTxCount++;
          allTxDetails.push({
            signature: tx.signature,
            wallet: wallet,
            type: tx.type || 'UNKNOWN',
            description: tx.description || 'DeFi Transaction',
            timestamp: tx.timestamp,
            fee: tx.fee || 0
          });
        });

      } catch (e) {
        console.error(`Error fetching wallet ${wallet}:`, e);
      }
    }

    // Sort by timestamp descending
    allTxDetails.sort((a, b) => b.timestamp - a.timestamp);

    // Determine if quest is completed
    const isCompleted = totalTxCount > 0;

    return NextResponse.json({
      success: true,
      isCompleted,
      txCount: totalTxCount,
      walletsChecked: walletList.length,
      transactions: allTxDetails.slice(0, 10), // Return max 10 transactions
      checkedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Error checking DeFi quest:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to check DeFi quest' 
    }, { status: 500 });
  }
}
