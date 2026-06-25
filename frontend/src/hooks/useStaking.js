import { useState, useEffect } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function useStaking(authToken) {
  const [positions, setPositions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPositions = async () => {
    if (!authToken) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${API}/staking/positions`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setPositions(response.data.positions);
      setStats({
        total_staked: response.data.total_staked,
        total_points: response.data.total_points,
      });
    } catch (err) {
      console.error('Failed to fetch positions:', err);
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  const stakeNFT = async (objectId) => {
    try {
      await axios.post(
        `${API}/staking/stake`,
        { object_id: objectId },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      await fetchPositions();
      return true;
    } catch (err) {
      console.error('Failed to stake NFT:', err);
      throw err;
    }
  };

  const unstakeNFT = async (objectId) => {
    try {
      const response = await axios.post(
        `${API}/staking/unstake`,
        { object_id: objectId },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      await fetchPositions();
      return response.data;
    } catch (err) {
      console.error('Failed to unstake NFT:', err);
      throw err;
    }
  };

  useEffect(() => {
    fetchPositions();
  }, [authToken]);

  return {
    positions,
    stats,
    loading,
    error,
    stakeNFT,
    unstakeNFT,
    refreshPositions: fetchPositions,
  };
}
