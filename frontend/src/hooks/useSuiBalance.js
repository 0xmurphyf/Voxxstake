import { useState, useEffect } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

/**
 * Fetch SUI balance for a given address via backend proxy.
 * Returns balance in SUI (not MIST), or null if loading/error.
 *
 * @param {string|null|undefined} address - Sui wallet address
 * @param {string|null} authToken - JWT auth token
 */
export function useSuiBalance(address, authToken) {
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    if (!address || !authToken) {
      setBalance(null);
      return;
    }

    let cancelled = false;

    async function fetchBalance() {
      try {
        const r = await axios.get(`${API}/balance/${address}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!cancelled && r.data) {
          setBalance(r.data.balance);
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
  }, [address, authToken]);

  return balance;
}
