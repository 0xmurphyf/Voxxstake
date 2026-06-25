import { useState, useEffect } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function useVoxxNFTs(authToken) {
  const [nfts, setNfts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchNFTs = async () => {
    if (!authToken) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${API}/staking/nfts`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setNfts(response.data.nfts);
    } catch (err) {
      console.error('Failed to fetch NFTs:', err);
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNFTs();
  }, [authToken]);

  return { nfts, loading, error, refetch: fetchNFTs };
}
