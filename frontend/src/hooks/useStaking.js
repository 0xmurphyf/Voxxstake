import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

export function useStaking(authToken) {
  const [positions, setPositions] = useState([]);
  const [stats, setStats] = useState(null);
  const [sellAlerts, setSellAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  // Track which token we've loaded for, so we reload when token changes
  const loadedTokenRef = useRef(null);

  const applyResponse = (data) => {
    setPositions(data.positions || []);
    setSellAlerts(data.sell_alerts || []);
    setStats({
      total_active: data.total_active || 0,
      total_paused: data.total_paused || 0,
      total_lore_points: data.total_lore_points || 0,
      nft_count: data.nft_count || 0,
      holding_multiplier: data.holding_multiplier || 1.0,
    });
  };

  const loadCached = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(`${API}/staking/cached`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      applyResponse(r.data);
    } catch (err) {
      console.error('Failed to load cached stakes:', err);
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  const syncStakes = useCallback(async () => {
    if (!authToken) return;
    setSyncing(true);
    setError(null);
    try {
      const r = await axios.post(
        `${API}/staking/sync`,
        {},
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      applyResponse(r.data);
    } catch (err) {
      console.error('Failed to sync stakes:', err);
      setError(err.response?.data?.detail || err.message);
    } finally {
      setSyncing(false);
    }
  }, [authToken]);

  // Load cached data immediately when token is available, then sync
  useEffect(() => {
    if (!authToken) {
      // Only clear data if we previously had a token (actual logout)
      if (loadedTokenRef.current) {
        setPositions([]);
        setStats(null);
        setSellAlerts([]);
        loadedTokenRef.current = null;
      }
      return;
    }

    // Skip if we've already loaded for this exact token
    if (loadedTokenRef.current === authToken) return;
    loadedTokenRef.current = authToken;

    let cancelled = false;
    (async () => {
      await loadCached();
      if (!cancelled) {
        syncStakes();
      }
    })();
    return () => { cancelled = true; };
  }, [authToken, loadCached, syncStakes]);

  // Periodic re-sync every 60 seconds
  useEffect(() => {
    if (!authToken) return;
    const interval = setInterval(() => {
      syncStakes();
    }, 60000);
    return () => clearInterval(interval);
  }, [authToken, syncStakes]);

  return {
    positions,
    stats,
    sellAlerts,
    loading,
    syncing,
    error,
    syncStakes,
  };
}
