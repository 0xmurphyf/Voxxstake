import { useState, useEffect } from 'react';

const SUI_RPC = 'https://fullnode.mainnet.sui.io:443';

/**
 * Fetch SUI balance for a given address.
 * Returns balance in SUI (not MIST), or null if loading/error.
 */
export function useSuiBalance(address) {
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    if (!address) {
      setBalance(null);
      return;
    }

    let cancelled = false;

    async function fetchBalance() {
      try {
        const res = await fetch(SUI_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'suix_getBalance',
            params: [address],
          }),
        });
        const data = await res.json();
        if (!cancelled && data.result) {
          // totalBalance is in MIST (1 SUI = 10^9 MIST)
          const mist = parseInt(data.result.totalBalance || '0', 10);
          setBalance((mist / 1e9).toFixed(2));
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to fetch balance:', err);
          setBalance(null);
        }
      }
    }

    fetchBalance();
    // Refresh every 30s
    const interval = setInterval(fetchBalance, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [address]);

  return balance;
}
