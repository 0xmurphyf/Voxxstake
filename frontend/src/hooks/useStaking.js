import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function useStaking(authToken) {
  const [positions, setPositions] = useState([]);
  const [stats, setStats] = useState(null);
  const [sellAlerts, setSellAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const initialSyncDone = useRef(false);

  const syncStakes = useCallback(async () => {
    if (!authToken) return;

    setLoading(true);
    setError(null);
    try {
      const response = await axios.post(
        `${API}/staking/sync`,
        {},
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      setPositions(response.data.positions);
      setSellAlerts(response.data.sell_alerts || []);
      setStats({
        total_active: response.data.total_active,
        total_paused: response.data.total_paused,
        total_lore_points: response.data.total_lore_points,
      });
      initialSyncDone.current = true;
    } catch (err) {
      console.error('Failed to sync stakes:', err);
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    if (authToken && !initialSyncDone.current) {
      syncStakes();
    }
  }, [authToken, syncStakes]);

  // Periodic re-sync every 60 seconds to detect sell events / point updates
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
    error,
    syncStakes,
  };
}
