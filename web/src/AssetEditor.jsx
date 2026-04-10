import { useEffect, useRef, useState } from 'react';

const ASSET_TYPES = [
  { id: 'orb', label: 'Orb', imagePath: '/cards/orb.svg' },
  { id: 'enemy', label: 'Enemy', imagePath: '/cards/enemy.svg' },
  { id: 'player', label: 'Player', imagePath: '/cards/player.svg' },
];

const RESULT_POLL_ATTEMPTS = 4;
const RESULT_POLL_INTERVAL_MS = 400;

function getAssetCardAriaLabel(label, isSelected) {
  return isSelected
    ? `Show the ${label} asset editor; currently selected.`
    : `Show the ${label} asset editor.`;
}

function focusAssetCard(assetId) {
  if (typeof document === 'undefined') return;
  window.requestAnimationFrame(() => {
    document.querySelector(`[data-testid="asset-card-${assetId}"]`)?.focus();
  });
}

function getAssetVersionEntryAriaLabel(entry, index, total) {
  const parts = [
    `Asset version ${index + 1} of ${total}.`,
    `${entry.subType || 'asset'} asset.`,
    `${((entry.latencyMs || 0) / 1000).toFixed(1)} seconds by VARCO3D.`
  ];

  if (entry.cacheHit) {
    parts.push('Cache hit.');
  }

  if (entry.appliedAt) {
    parts.push('Currently applied.');
  }

  return parts.join(' ');
}

function getAssetVersionEntryAriaDescription(entry) {
  if (entry.appliedAt) {
    return 'Currently applied.';
  }
  return 'Press Enter or Space to apply this asset version.';
}

function focusAssetVersionEntry(entryId) {
  if (typeof document === 'undefined') return;
  window.requestAnimationFrame(() => {
    document.querySelector(`[data-asset-version-id="${entryId}"]`)?.focus();
  });
}

function handleAssetVersionEntryKeyDown(event, currentId, entries, onApply) {
  if (event.target !== event.currentTarget) {
    return;
  }

  const navigationKeys = ['ArrowUp', 'ArrowDown', 'Home', 'End'];
  if (navigationKeys.includes(event.key) && entries.length > 1) {
    const currentIndex = entries.findIndex((entry) => entry.id === currentId);
    if (currentIndex < 0) return;

    event.preventDefault();

    let nextIndex = currentIndex;
    if (event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % entries.length;
    } else if (event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + entries.length) % entries.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = entries.length - 1;
    }

    focusAssetVersionEntry(entries[nextIndex].id);
    return;
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onApply(currentId);
  }
}

function getLatestAssetResultAriaLabel(result, assetLabel) {
  const parts = [
    `Latest ${assetLabel} asset preview.`,
    `${((result?.latencyMs || 0) / 1000).toFixed(1)} seconds by VARCO3D.`
  ];

  if (result?.cacheHit) {
    parts.push('Cache hit.');
  }

  parts.push('Contains a 3D preview and an apply action.');
  return parts.join(' ');
}

function getLatestAssetResultAriaDescription(assetLabel) {
  return `Press Enter or Space to apply the latest ${assetLabel} asset result.`;
}

function handleLatestAssetResultKeyDown(event, onApply) {
  if (event.target !== event.currentTarget) {
    return;
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onApply();
  }
}

function handleAssetCardArrowKeyDown(event, currentId, onSelect) {
  const navigationKeys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!navigationKeys.includes(event.key) || ASSET_TYPES.length < 2) {
    return;
  }

  const currentIndex = ASSET_TYPES.findIndex((asset) => asset.id === currentId);
  if (currentIndex < 0) return;

  event.preventDefault();

  let nextIndex = currentIndex;
  if (event.key === 'ArrowRight') {
    nextIndex = (currentIndex + 1) % ASSET_TYPES.length;
  } else if (event.key === 'ArrowLeft') {
    nextIndex = (currentIndex - 1 + ASSET_TYPES.length) % ASSET_TYPES.length;
  } else if (event.key === 'Home') {
    nextIndex = 0;
  } else if (event.key === 'End') {
    nextIndex = ASSET_TYPES.length - 1;
  }

  const nextAsset = ASSET_TYPES[nextIndex];
  onSelect(nextAsset.id);
  focusAssetCard(nextAsset.id);
}

function rasterizeAssetToPngDataUrl(imageUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width || 256;
      canvas.height = image.naturalHeight || image.height || 256;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('canvas context unavailable'));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => reject(new Error('asset rasterize failed'));
    image.src = imageUrl;
  });
}

function getModelUrl(payload) {
  return payload?.data?.[0]?.model_url || payload?.model_url || '';
}

function getRequestId(payload) {
  return payload?.requestId || payload?.data?.requestId || null;
}

function wait(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function createConversionError(message, details = {}) {
  const error = new Error(message);
  Object.assign(error, details);
  return error;
}

async function pollForResult(requestId, onStatusChange) {
  for (let attempt = 1; attempt <= RESULT_POLL_ATTEMPTS; attempt += 1) {
    onStatusChange({
      tone: 'pending',
      label: 'Request accepted',
      detail: `Waiting for 3D preview · poll ${attempt}/${RESULT_POLL_ATTEMPTS}`,
      requestId
    });

    const resultRes = await fetch(`/api/varco/image-to-3d/result/${requestId}`);
    const resultJson = await resultRes.json();

    if (!resultRes.ok || resultJson?.ok === false) {
      throw createConversionError(
        resultJson?.message || `3D conversion request failed (${resultRes.status})`,
        { requestId, status: 'error' }
      );
    }

    const result = resultJson.result || resultJson;
    const modelUrl = getModelUrl(result);
    const status = typeof result?.status === 'string' ? result.status.toLowerCase() : '';

    if (modelUrl) {
      return result;
    }

    if (["failed", "error", "cancelled"].includes(status)) {
      throw createConversionError(
        result?.message || `3D conversion ${status}`,
        { requestId, status }
      );
    }

    if (attempt < RESULT_POLL_ATTEMPTS) {
      await wait(RESULT_POLL_INTERVAL_MS);
    }
  }

  throw createConversionError(
    '3D preview is still processing. Try the conversion again in a moment.',
    { requestId, status: 'processing' }
  );
}

export default function AssetEditor({
  editHistory = [],
  dispatch,
  studioPack = null,
  draftPrompts = {},
  selectedKey = 'orb',
  onSelectKey = () => {},
  onDraftChange = () => {}
}) {
  const [selectedAsset, setSelectedAsset] = useState(selectedKey);
  const [isConverting, setIsConverting] = useState(false);
  const [latestResult, setLatestResult] = useState(null);
  const [conversionStatus, setConversionStatus] = useState(null);
  const conversionTokenRef = useRef(0);

  useEffect(() => {
    import('@google/model-viewer').catch(() => null);
  }, []);

  function resetTransientState({ cancelInFlight = false } = {}) {
    if (cancelInFlight) {
      conversionTokenRef.current += 1;
      setIsConverting(false);
    }
    setLatestResult(null);
    setConversionStatus(null);
  }

  useEffect(() => {
    if (selectedKey && selectedKey !== selectedAsset) {
      setSelectedAsset(selectedKey);
      resetTransientState({ cancelInFlight: true });
    }
  }, [selectedAsset, selectedKey]);

  const currentAsset = ASSET_TYPES.find(a => a.id === selectedAsset);
  const typeHistory = editHistory.filter(e => e.type === 'asset' && e.subType === selectedAsset);
  const directionPrompt = draftPrompts?.[selectedAsset] || currentAsset?.label || '';

  async function handleConvert() {
    const conversionToken = conversionTokenRef.current + 1;
    conversionTokenRef.current = conversionToken;
    setIsConverting(true);
    resetTransientState();
    const assetAtStart = selectedAsset;
    const promptAtStart = directionPrompt;
    const start = Date.now();
    const isActiveConversion = () => conversionTokenRef.current === conversionToken;
    const applyIfActive = (callback) => {
      if (!isActiveConversion()) return;
      callback();
    };

    try {
      const imageUrl = window.location.origin + currentAsset.imagePath;
      const image = await rasterizeAssetToPngDataUrl(imageUrl);
      const res = await fetch('/api/varco/image-to-3d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
      });
      const data = await res.json();
      let result = data.result || data;
      const requestId = getRequestId(result) || getRequestId(data);

      if (!res.ok || data?.ok === false) {
        throw createConversionError(
          data?.message || `3D conversion failed (${res.status})`,
          { requestId, status: 'error' }
        );
      }

      if (!getModelUrl(result) && requestId) {
        applyIfActive(() => {
          setConversionStatus({
            tone: 'pending',
            label: 'Request accepted',
            detail: data.message || result.message || 'VARCO accepted the job and is preparing the 3D preview.',
            requestId
          });
        });
        result = await pollForResult(requestId, (status) => {
          applyIfActive(() => setConversionStatus(status));
        });
      }

      const latencyMs = Date.now() - start;
      const modelUrl = getModelUrl(result);
      if (!modelUrl) {
        throw new Error('3D result did not include a preview model.');
      }

      const cacheHit = Boolean(result?.cache_hit || data.cache_hit);
      applyIfActive(() => {
        dispatch({ type: 'EDIT_GENERATE', editType: 'asset', subType: assetAtStart, prompt: promptAtStart, result: { modelUrl }, latencyMs, cacheHit });
        setLatestResult({ modelUrl, latencyMs, cacheHit });
        setConversionStatus(requestId ? {
          tone: 'ready',
          label: 'Preview ready',
          detail: 'The 3D preview is ready to inspect and apply.',
          requestId
        } : null);
      });
    } catch (e) {
      console.error('3D conversion failed:', e);
      const errorDetail = e instanceof Error ? e.message : 'Unknown conversion error';
      applyIfActive(() => {
        setConversionStatus({
          tone: 'error',
          label: e?.status && e.status !== 'processing' ? 'Conversion failed' : 'Conversion stalled',
          detail: errorDetail,
          requestId: e?.requestId || null
        });
      });
    } finally {
      applyIfActive(() => setIsConverting(false));
    }
  }

  function handleApply(historyId) {
    dispatch({ type: 'EDIT_APPLY', historyId });
  }

  function applyLatestResult() {
    const entry = typeHistory.at(-1);
    if (entry) {
      handleApply(entry.id);
    }
  }

  function selectAssetCard(assetId) {
    setSelectedAsset(assetId);
    resetTransientState({ cancelInFlight: true });
    onSelectKey(assetId);
  }

  return (
    <div className="asset-editor">
      <div className="card-grid" data-testid="asset-card-group">
        {ASSET_TYPES.map(asset => {
          const isSelected = selectedAsset === asset.id;
          const ariaLabel = getAssetCardAriaLabel(asset.label, isSelected);

          return (
          <button
            key={asset.id}
            type="button"
            className={`card-item ${isSelected ? 'selected' : ''}`}
            data-testid={`asset-card-${asset.id}`}
            aria-pressed={isSelected}
            aria-description={ariaLabel}
            title={ariaLabel}
            onClick={() => {
              selectAssetCard(asset.id);
            }}
            onKeyDown={(event) => handleAssetCardArrowKeyDown(event, asset.id, selectAssetCard)}
          >
            <img src={asset.imagePath} alt={asset.label} width="60" height="60" />
            <div className="card-label">{asset.label}</div>
          </button>
          );
        })}
      </div>

      {studioPack && (
        <div className="studio-inline-callout">
          <strong>{studioPack.heroName}</strong>
          <span>{studioPack.assets?.[selectedAsset]}</span>
        </div>
      )}

      <div className="prompt-section">
        <label className="prompt-label">아트 디렉션</label>
        <input
          className="prompt-input"
          value={directionPrompt}
          onChange={(e) => onDraftChange(selectedAsset, e.target.value)}
          placeholder={currentAsset?.label}
        />
      </div>

      <button className="regenerate-btn" onClick={handleConvert} disabled={isConverting}
        style={{ marginTop: '8px', width: '100%' }}>
        {isConverting ? '⏳ Converting to 3D...' : '▶ 3D 변환'}
      </button>

      {conversionStatus && (
        <div
          className={`conversion-status conversion-status-${conversionStatus.tone}`}
          data-testid="asset-conversion-status"
        >
          <strong>{conversionStatus.label}</strong>
          <span>{conversionStatus.detail}</span>
          {conversionStatus.requestId && <code>{conversionStatus.requestId}</code>}
        </div>
      )}

      {latestResult && (
        <div
          className="generation-result"
          data-testid="asset-generation-result"
          role="group"
          tabIndex={0}
          aria-label={getLatestAssetResultAriaLabel(latestResult, currentAsset?.label || selectedAsset)}
          aria-description={getLatestAssetResultAriaDescription(currentAsset?.label || selectedAsset)}
          title={getLatestAssetResultAriaLabel(latestResult, currentAsset?.label || selectedAsset)}
          onKeyDown={(event) => handleLatestAssetResultKeyDown(event, applyLatestResult)}
        >
          <model-viewer
            src={latestResult.modelUrl}
            auto-rotate
            camera-controls
            aria-label={`Latest ${currentAsset?.label || selectedAsset} 3D preview`}
            title={`Latest ${currentAsset?.label || selectedAsset} 3D preview`}
            style={{ width: '100%', height: '180px', background: '#1a1a2e' }}
          />
          <div className="latency-badge">Converted in {(latestResult.latencyMs / 1000).toFixed(1)}s by VARCO3D</div>
          {latestResult.cacheHit && <div className="cache-hit-badge">cache hit</div>}
          <button
            className="apply-btn"
            type="button"
            aria-label={`Apply latest ${currentAsset?.label || selectedAsset} asset result to the game`}
            title={`Apply latest ${currentAsset?.label || selectedAsset} asset result to the game`}
            onClick={applyLatestResult}
          >
            ✓ Apply → 게임에 즉시 반영
          </button>
        </div>
      )}

      {typeHistory.length > 0 && (
        <div className="version-history" data-testid="asset-version-history" role="group" aria-label="Asset version history list">
          <div className="version-history-title">버전 이력</div>
          {[...typeHistory].reverse().map((entry, index, entries) => (
            <div
              key={entry.id}
              className={`version-item ${entry.appliedAt ? 'active' : ''}`}
              data-testid="asset-version-entry"
              data-asset-version-id={entry.id}
              role="group"
              tabIndex={0}
              aria-label={getAssetVersionEntryAriaLabel(entry, index, entries.length)}
              aria-description={getAssetVersionEntryAriaDescription(entry)}
              title={getAssetVersionEntryAriaLabel(entry, index, entries.length)}
              onKeyDown={(event) => handleAssetVersionEntryKeyDown(event, entry.id, entries, handleApply)}
            >
              <span className="version-prompt">{entry.subType}</span>
              <span className="version-latency">{((entry.latencyMs || 0) / 1000).toFixed(1)}s</span>
              {entry.cacheHit && <span className="cache-hit-badge">cache</span>}
              {entry.appliedAt && <span className="applied-badge">적용됨</span>}
              <button className="apply-btn small" onClick={() => handleApply(entry.id)}>Apply</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
