import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { IdentificationBadge, CheckCircle, PencilSimple, FloppyDisk, X } from '@phosphor-icons/react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;
const VOXX_PLACEHOLDER = 'https://images.pexels.com/photos/9203122/pexels-photo-9203122.jpeg?auto=compress&cs=tinysrgb&w=400';

function formatDuration(days) {
  if (days < 1) {
    const hours = days * 24;
    if (hours < 1) return `${(hours * 60).toFixed(0)}m`;
    return `${hours.toFixed(1)}h`;
  }
  return `${days.toFixed(1)}d`;
}

export function IDCard({ positions, stats, walletAddress, authToken }) {
  const activePositions = positions?.filter(p => p.status === 'active') || [];
  const totalNfts = stats?.nft_count || activePositions.length || 0;
  const totalCredits = (stats?.total_lore_points || 0).toFixed(0);
  const multiplier = stats?.holding_multiplier || 1.0;
  const creditsPerHour = (totalNfts * multiplier).toFixed(1);
  const maxDuration = activePositions.reduce((max, p) => {
    if ((p.duration_days || 0) > max) return p.duration_days;
    return max;
  }, 0) || 0;

  // Profile state — loaded from backend
  const [displayName, setDisplayName] = useState('');
  const [pfpUrl, setPfpUrl] = useState(null);
  const [pfpObjectId, setPfpObjectId] = useState(null);
  const [pfpValid, setPfpValid] = useState(true);
  const [checkingPfp, setCheckingPfp] = useState(false);

  // Edit state
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [selectingPfp, setSelectingPfp] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load profile from backend
  const loadProfile = useCallback(async () => {
    if (!authToken) return;
    try {
      const r = await axios.get(`${API}/profile`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const { name, pfp_url, pfp_object_id } = r.data;
      setDisplayName(name || '');
      setPfpUrl(pfp_url || null);
      setPfpObjectId(pfp_object_id || null);
      setNameDraft(name || '');
    } catch (err) {
      console.error('Failed to load profile:', err);
    }
  }, [authToken]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Save profile to backend
  const saveProfile = useCallback(async (updates) => {
    if (!authToken) return;
    setSaving(true);
    try {
      await axios.put(`${API}/profile`, updates, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setSaving(false);
    }
  }, [authToken]);

  // Verify PFP is still held on-chain
  const verifyPfp = useCallback(async (objectId) => {
    if (!authToken || !objectId) return false;
    try {
      setCheckingPfp(true);
      const r = await axios.get(`${API}/staking/nft/${objectId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const pos = r.data?.position;
      return pos?.status === 'active';
    } catch {
      return false;
    } finally {
      setCheckingPfp(false);
    }
  }, [authToken]);

  // On mount, verify existing PFP is still held
  useEffect(() => {
    if (pfpObjectId && pfpUrl) {
      verifyPfp(pfpObjectId).then(valid => {
        if (!valid) {
          setPfpValid(false);
        } else {
          setPfpValid(true);
        }
      });
    }
  }, [pfpObjectId, pfpUrl, verifyPfp]);

  const selectPfp = (position) => {
    const imgUrl = position.image_url || VOXX_PLACEHOLDER;
    setPfpUrl(imgUrl);
    setPfpObjectId(position.object_id);
    setPfpValid(true);
    setSelectingPfp(false);
    saveProfile({ pfp_url: imgUrl, pfp_object_id: position.object_id });
  };

  const saveName = () => {
    const trimmed = nameDraft.trim().slice(0, 32);
    setDisplayName(trimmed);
    setEditingName(false);
    saveProfile({ name: trimmed });
  };

  const cancelEditName = () => {
    setNameDraft(displayName);
    setEditingName(false);
  };

  // Generate temp ID
  const tempId = walletAddress
    ? `NTR-${walletAddress.slice(2, 8).toUpperCase()}`
    : 'NTR-000000';

  return (
    <div className="term-panel p-5 sm:p-6 mb-5" data-testid="id-card">
      <h2 className="term-header">TEMPORARY IDENTITY CARD</h2>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* PFP Section */}
        <div style={{ flexShrink: 0 }}>
          <div
            style={{
              width: 100, height: 100,
              border: '2px solid rgba(0,255,204,0.4)',
              background: 'rgba(0,15,20,0.8)',
              overflow: 'hidden',
              position: 'relative',
              cursor: activePositions.length > 0 ? 'pointer' : 'default',
            }}
            onClick={() => activePositions.length > 0 && setSelectingPfp(!selectingPfp)}
            title={activePositions.length > 0 ? 'Click to change PFP' : 'No credentials to use as PFP'}
          >
            {pfpUrl && pfpValid ? (
              <img src={pfpUrl} alt="PFP" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: '100%', height: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,255,204,0.05)',
              }}>
                <IdentificationBadge size={40} weight="light" style={{ color: 'rgba(0,255,204,0.3)' }} />
              </div>
            )}
            {activePositions.length > 0 && (
              <div style={{
                position: 'absolute', bottom: 0, right: 0,
                background: 'rgba(0,10,15,0.9)', padding: '2px 6px',
              }}>
                <PencilSimple size={12} style={{ color: 'rgba(0,255,204,0.7)' }} />
              </div>
            )}
            {checkingPfp && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,10,15,0.7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ width: 20, height: 20, border: '2px solid rgba(0,255,204,0.3)', borderTopColor: '#00FFCC', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              </div>
            )}
          </div>
          <p className="mono text-xs mt-2 text-center" style={{ color: 'rgba(0,255,204,0.4)' }}>PFP</p>
        </div>

        {/* ID Details */}
        <div style={{ flex: 1, minWidth: 220 }}>
          {/* Name row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <IdentificationBadge size={18} weight="fill" style={{ color: '#00FFCC', flexShrink: 0 }} />
            {editingName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') cancelEditName(); }}
                  placeholder="Enter your name..."
                  maxLength={32}
                  autoFocus
                  disabled={saving}
                  className="term-input"
                  style={{
                    fontSize: '0.85rem',
                    padding: '4px 10px',
                    maxWidth: 220,
                    color: '#fff',
                    fontWeight: 600,
                  }}
                  data-testid="name-input"
                />
                <button onClick={saveName} disabled={saving} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#00FFCC', padding: 2 }} data-testid="save-name-button">
                  <FloppyDisk size={16} weight="bold" />
                </button>
                <button onClick={cancelEditName} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,255,204,0.5)', padding: 2 }} data-testid="cancel-name-button">
                  <X size={16} weight="bold" />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="mono text-sm" style={{ color: displayName ? '#fff' : 'rgba(0,255,204,0.35)', letterSpacing: '0.1em', fontWeight: displayName ? 600 : 400 }}>
                  {displayName || 'ANONYMOUS APPLICANT'}
                </span>
                <button
                  onClick={() => { setNameDraft(displayName); setEditingName(true); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,255,204,0.4)', padding: 2 }}
                  title="Edit name"
                  data-testid="edit-name-button"
                >
                  <PencilSimple size={13} weight="bold" />
                </button>
                {saving && <span className="mono text-xs" style={{ color: 'rgba(0,255,204,0.4)' }}>saving...</span>}
              </div>
            )}
            {pfpValid && pfpUrl && (
              <span className="status-badge badge-active" style={{ fontSize: '0.6rem', flexShrink: 0 }}>
                <CheckCircle size={10} weight="fill" />
                VERIFIED
              </span>
            )}
          </div>

          {/* ID number */}
          <p className="mono text-xs mb-3" style={{ color: 'rgba(0,255,204,0.45)', letterSpacing: '0.12em' }}>
            {tempId}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
            <div>
              <span className="hud-label" style={{ fontSize: '0.62rem' }}>STATUS</span>
              <p className="mono text-xs" style={{ color: '#00FF88' }}>
                <span className="status-dot" style={{ display: 'inline-block', marginRight: 6 }} />
                REGISTERED
              </p>
            </div>
            <div>
              <span className="hud-label" style={{ fontSize: '0.62rem' }}>CREDENTIALS</span>
              <p className="mono text-xs" style={{ color: '#fff' }}>{totalNfts}</p>
            </div>
            <div>
              <span className="hud-label" style={{ fontSize: '0.62rem' }}>STANDING</span>
              <p className="mono text-xs" style={{ color: '#00FFCC' }}>{multiplier.toFixed(1)}x</p>
            </div>
            <div>
              <span className="hud-label" style={{ fontSize: '0.62rem' }}>ACCRUAL</span>
              <p className="mono text-xs" style={{ color: '#fff' }}>{creditsPerHour} CR/HR</p>
            </div>
            <div>
              <span className="hud-label" style={{ fontSize: '0.62rem' }}>CREDITS</span>
              <p className="mono text-xs" style={{ color: '#00FF88', fontWeight: 600 }}>{totalCredits}</p>
            </div>
            <div>
              <span className="hud-label" style={{ fontSize: '0.62rem' }}>REGISTERED</span>
              <p className="mono text-xs" style={{ color: 'rgba(0,255,204,0.7)' }}>
                {maxDuration > 0 ? formatDuration(maxDuration) : '—'}
              </p>
            </div>
          </div>

          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(0,255,204,0.1)' }}>
            <span className="hud-label" style={{ fontSize: '0.62rem' }}>WALLET</span>
            <p className="mono text-xs" style={{ color: 'rgba(0,255,204,0.5)' }}>
              {walletAddress ? `${walletAddress.slice(0, 14)}...${walletAddress.slice(-6)}` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* PFP Selector */}
      {selectingPfp && activePositions.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(0,255,204,0.12)' }}>
          <p className="hud-label mb-3" style={{ fontSize: '0.62rem' }}>SELECT PROFILE PICTURE</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {activePositions.slice(0, 12).map((pos) => {
              const imgSrc = pos.image_url || VOXX_PLACEHOLDER;
              const isSelected = pfpUrl === imgSrc;
              return (
                <div
                  key={pos.object_id}
                  onClick={() => selectPfp(pos)}
                  style={{
                    width: 56, height: 56,
                    border: isSelected ? '2px solid #00FFCC' : '1px solid rgba(0,255,204,0.25)',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    background: 'rgba(0,15,20,0.8)',
                    flexShrink: 0,
                    transition: 'all 0.2s',
                    boxShadow: isSelected ? '0 0 10px rgba(0,255,204,0.3)' : 'none',
                  }}
                  title={pos.name || `VOXX #${pos.object_id.slice(-6)}`}
                >
                  <img
                    src={imgSrc}
                    alt={pos.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { e.target.src = VOXX_PLACEHOLDER; }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* PFP validity warning */}
      {!pfpValid && pfpUrl && (
        <div className="alert-banner mt-3" style={{ fontSize: '0.75rem', padding: '8px 12px' }}>
          <strong>PFP INVALID:</strong> You no longer hold this NFT. Select a new one.
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
