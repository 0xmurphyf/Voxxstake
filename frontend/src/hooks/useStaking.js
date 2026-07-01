import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

export function useStaking(authToken) {
  const [positions, setPositions] = useState([]);
  const [stats, setStats] = useState(null);
  const [sellAlerts, setSellAlerts] = useState([]);
  const [loading, setLoading] = useState(false); // initial cached-data load
  const [syncing, setSyncing] = useState(false); // background RPC sync
  const [error, setError] = useState(null);
  const initialLoadDone = useRef(false);

  const applyResponse = (data) => {
    setPositions(data.positions || []);
    setSellAlerts(data.sell_alerts || []);
    setStats({
      total_active: data.total_active || 0,
      total_paused: data.total_paused || 0,
      total_lore_points: data.total_lore_points || 0,
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
      // Don't surface this error — we'll fall back to sync
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

  // On login: load cached instantly, then sync in background
  useEffect(() => {
    if (!authToken) {
      initialLoadDone.current = false;
      setPositions([]);
      setStats(null);
      setSellAlerts([]);
      return;
    }
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

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
