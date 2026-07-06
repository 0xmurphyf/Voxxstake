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

export function IDCard({ positions, stats, walletAddress, authToken, onProfileSaved }) {
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
  const [backendAddress, setBackendAddress] = useState(null);

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
      const { name, pfp_url, pfp_object_id, address } = r.data;
      setDisplayName(name || '');
      setPfpUrl(pfp_url || null);
      setPfpObjectId(pfp_object_id || null);
      setNameDraft(name || '');
      if (address) setBackendAddress(address);
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
      // Notify parent so WaitingList can refresh
      if (onProfileSaved) onProfileSaved();
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setSaving(false);
    }
  }, [authToken]);

  // PFP selector pagination
  const [pfpPage, setPfpPage] = useState(0);
  const PFP_PAGE_SIZE = 48;
  const pfpTotalPages = Math.ceil(activePositions.length / PFP_PAGE_SIZE);
  const pfpSlice = activePositions.slice(pfpPage * PFP_PAGE_SIZE, (pfpPage + 1) * PFP_PAGE_SIZE);

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

  // Generate temp ID — use backend address as fallback when wallet hasn't reconnected yet
  const resolvedAddress = walletAddress || backendAddress;
  const tempId = resolvedAddress
    ? `NTR-${resolvedAddress.slice(2, 8).toUpperCase()}`
    : 'NTR-000000';

  return (
    <div className="term-panel p-5 sm:p-6 mb-5" data-testid="id-card">
      <h2 className="term-header">TEMPORARY IDENTITY CARD</h2>

      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* PFP Section */}
        <div style={{ flexShrink: 0 }}>
          <div
            style={{
              width: 240, height: 240,
              border: '3px solid rgba(0,255,204,0.5)',
              background: 'rgba(0,15,20,0.8)',
              overflow: 'hidden',
              position: 'relative',
              cursor: activePositions.length > 0 ? 'pointer' : 'default',
            }}
            onClick={() => {
              if (activePositions.length > 0) {
                setPfpPage(0);
                setSelectingPfp(!selectingPfp);
              }
            }}
            title={activePositions.length > 0 ? 'Click to change PFP' : 'No credentials to use as PFP'}
          >
            {pfpObjectId && pfpValid ? (
              <img src={pfpUrl || VOXX_PLACEHOLDER} alt="PFP" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: '100%', height: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,255,204,0.05)',
              }}>
                <IdentificationBadge size={80} weight="light" style={{ color: 'rgba(0,255,204,0.3)' }} />
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
          <p className="mono text-xs mt-2 text-center" style={{ color: 'rgba(0,255,204,0.4)', fontSize: '0.7rem' }}>PFP</p>
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
                <span className="mono" style={{ color: displayName ? '#fff' : 'rgba(0,255,204,0.35)', letterSpacing: '0.1em', fontWeight: displayName ? 600 : 400, fontSize: '1.05rem' }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
            <div>
              <span className="hud-label" style={{ fontSize: '0.68rem' }}>STATUS</span>
              <p className="mono" style={{ color: '#00FF88', fontSize: '0.95rem' }}>
                <span className="status-dot" style={{ display: 'inline-block', marginRight: 6 }} />
                REGISTERED
              </p>
            </div>
            <div>
              <span className="hud-label" style={{ fontSize: '0.68rem' }}>CREDENTIALS</span>
              <p className="mono" style={{ color: '#fff', fontSize: '0.95rem' }}>{totalNfts}</p>
            </div>
            <div>
              <span className="hud-label" style={{ fontSize: '0.68rem' }}>STANDING</span>
              <p className="mono" style={{ color: '#00FFCC', fontSize: '0.95rem' }}>{multiplier.toFixed(3)}x</p>
            </div>
            <div>
              <span className="hud-label" style={{ fontSize: '0.68rem' }}>ACCRUAL</span>
              <p className="mono" style={{ color: '#fff', fontSize: '0.95rem' }}>{creditsPerHour} CR/HR</p>
            </div>
            <div>
              <span className="hud-label" style={{ fontSize: '0.68rem' }}>CREDITS</span>
              <p className="mono" style={{ color: '#00FF88', fontWeight: 600, fontSize: '0.95rem' }}>{totalCredits}</p>
            </div>
            <div>
              <span className="hud-label" style={{ fontSize: '0.68rem' }}>REGISTERED</span>
              <p className="mono" style={{ color: 'rgba(0,255,204,0.7)', fontSize: '0.95rem' }}>
                {maxDuration > 0 ? formatDuration(maxDuration) : '—'}
              </p>
            </div>
          </div>

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(0,255,204,0.1)', display: 'flex', gap: 32 }}>
            <div>
              <span className="hud-label" style={{ fontSize: '0.68rem' }}>WALLET</span>
              <p className="mono" style={{ color: 'rgba(0,255,204,0.5)', fontSize: '0.95rem' }}>
                {resolvedAddress ? `${resolvedAddress.slice(0, 14)}...${resolvedAddress.slice(-6)}` : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* PFP Selector */}
      {selectingPfp && activePositions.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(0,255,204,0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <p className="hud-label" style={{ fontSize: '0.62rem', margin: 0 }}>SELECT PROFILE PICTURE ({activePositions.length} credentials)</p>
            {pfpTotalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => setPfpPage(p => Math.max(0, p - 1))}
                  disabled={pfpPage === 0}
                  style={{
                    background: 'rgba(0,255,204,0.05)', border: '1px solid rgba(0,255,204,0.3)', color: pfpPage === 0 ? 'rgba(0,255,204,0.2)' : '#00FFCC',
                    fontFamily: 'Share Tech Mono, monospace', fontSize: '0.65rem', padding: '2px 8px', cursor: pfpPage === 0 ? 'default' : 'pointer',
                  }}
                >◀ PREV</button>
                <span className="mono" style={{ fontSize: '0.65rem', color: 'rgba(0,255,204,0.5)' }}>{pfpPage + 1}/{pfpTotalPages}</span>
                <button
                  onClick={() => setPfpPage(p => Math.min(pfpTotalPages - 1, p + 1))}
                  disabled={pfpPage >= pfpTotalPages - 1}
                  style={{
                    background: 'rgba(0,255,204,0.05)', border: '1px solid rgba(0,255,204,0.3)', color: pfpPage >= pfpTotalPages - 1 ? 'rgba(0,255,204,0.2)' : '#00FFCC',
                    fontFamily: 'Share Tech Mono, monospace', fontSize: '0.65rem', padding: '2px 8px', cursor: pfpPage >= pfpTotalPages - 1 ? 'default' : 'pointer',
                  }}
                >NEXT ▶</button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxHeight: 320, overflowY: 'auto', padding: '2px 0' }}>
            {pfpSlice.map((pos) => {
              const imgSrc = pos.image_url || VOXX_PLACEHOLDER;
              const isSelected = pfpObjectId === pos.object_id;
              return (
                <div
                  key={pos.object_id}
                  onClick={() => selectPfp(pos)}
                  style={{
                    width: 52, height: 52,
                    border: isSelected ? '2px solid #00FFCC' : '1px solid rgba(0,255,204,0.2)',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    background: 'rgba(0,15,20,0.8)',
                    flexShrink: 0,
                    transition: 'all 0.15s',
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
