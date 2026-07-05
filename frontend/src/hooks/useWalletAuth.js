import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@suiet/wallet-kit';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

export function useWalletAuth() {
  const wallet = useWallet();
  // CRITICAL: On first render, immediately restore token from localStorage.
  // This is the core of persistence — the user should see their dashboard
  // even before the wallet extension reconnects.
  const [authToken, setAuthToken] = useState(() => {
    return localStorage.getItem('sui_auth_token') || null;
  });
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState(null);

  // When wallet auto-connects on page load (some wallets do), sync the token.
  useEffect(() => {
    if (wallet.connected) {
      const existing = localStorage.getItem('sui_auth_token');
      if (existing) {
        setAuthToken(existing);
      }
    }
  }, [wallet.connected]);

  const login = useCallback(async () => {
    if (!wallet.account) {
      throw new Error('No wallet connected');
    }

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const nonceRes = await axios.post(`${API}/auth/nonce`, {
        address: wallet.account.address,
      });
      const { nonce } = nonceRes.data;

      const messageBytes = new TextEncoder().encode(nonce);

      const signFn = wallet.signPersonalMessage || wallet.signMessage;
      if (!signFn) {
        throw new Error('Connected wallet does not support message signing');
      }

      const signResult = await signFn({ message: messageBytes });

      const verifyRes = await axios.post(`${API}/auth/verify`, {
        address: wallet.account.address,
        nonce,
        signature: signResult.signature,
        bytes: signResult.bytes,
      });

      const { token } = verifyRes.data;
      setAuthToken(token);
      localStorage.setItem('sui_auth_token', token);
      setIsAuthenticating(false);
      return token;
    } catch (error) {
      console.error('Authentication error:', error);
      const msg =
        error.response?.data?.detail ||
        error.message ||
        'Authentication failed';
      setAuthError(msg);
      setIsAuthenticating(false);
      throw error;
    }
  }, [wallet.account, wallet.signPersonalMessage, wallet.signMessage]);

  const logout = useCallback(() => {
    setAuthToken(null);
    localStorage.removeItem('sui_auth_token');
    if (wallet.connected) {
      wallet.disconnect();
    }
  }, [wallet]);

  const loadToken = useCallback(() => {
    const token = localStorage.getItem('sui_auth_token');
    if (token) {
      setAuthToken(token);
    }
    return token;
  }, []);

  return { authToken, login, logout, isAuthenticating, authError, loadToken };
}
