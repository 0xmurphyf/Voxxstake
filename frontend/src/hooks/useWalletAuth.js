import { useState } from 'react';
import { useWallet } from '@suiet/wallet-kit';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

export function useWalletAuth() {
  const wallet = useWallet();
  const [authToken, setAuthToken] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState(null);

  async function login() {
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

      // Modern Sui wallets implement signPersonalMessage (sui:signPersonalMessage)
      // Fall back to signMessage for older wallets
      const signFn = wallet.signPersonalMessage || wallet.signMessage;
      if (!signFn) {
        throw new Error('Connected wallet does not support message signing');
      }

      const signResult = await signFn({ message: messageBytes });
      // signResult: { bytes: base64String, signature: base64String }

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
  }

  function logout() {
    setAuthToken(null);
    localStorage.removeItem('sui_auth_token');
  }

  function loadToken() {
    const token = localStorage.getItem('sui_auth_token');
    if (token) {
      setAuthToken(token);
    }
    return token;
  }

  return { authToken, login, logout, isAuthenticating, authError, loadToken };
}
