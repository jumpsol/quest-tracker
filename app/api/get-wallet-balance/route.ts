import { NextRequest, NextResponse } from 'next/server';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || 'fdeec242-8b73-41cd-b9e3-3ca680a2afc5';
const RPC_ENDPOINT = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, tokenType = 'SOL' } = body;

    if (!walletAddress) {
      return NextResponse.json({ error: 'Missing walletAddress' }, { status: 400 });
    }

    let solBalance = 0;
    let usdcBalance = 0;

    // Get SOL balance
    if (tokenType === 'SOL' || tokenType === 'BOTH') {
      const solResponse = await fetch(RPC_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getBalance',
          params: [walletAddress],
        }),
      });
      
      const solData = await solResponse.json();
      solBalance = (solData.result?.value || 0) / 1e9; // Convert lamports to SOL
    }

    // Get USDC balance
    if (tokenType === 'USDC' || tokenType === 'BOTH') {
      const usdcResponse = await fetch(RPC_ENDPOINT, {
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
          ],
        }),
      });
      
      const usdcData = await usdcResponse.json();
      const tokenAccount = usdcData.result?.value?.[0];
      
      if (tokenAccount) {
        usdcBalance = tokenAccount.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
      }
    }

    return NextResponse.json({
      solBalance: solBalance.toFixed(4),
      usdcBalance: usdcBalance.toFixed(2),
      walletAddress,
    });

  } catch (error) {
    console.error('[get-wallet-balance] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
