import { useEffect, useState } from 'react';

const ASSET_TYPES = [
  { id: 'orb', label: 'Orb', imagePath: '/cards/orb.svg' },
  { id: 'enemy', label: 'Enemy', imagePath: '/cards/enemy.svg' },
  { id: 'player', label: 'Player', imagePath: '/cards/player.svg' },
];

const RESULT_POLL_ATTEMPTS = 4;
const RESULT_POLL_INTERVAL_MS = 400;

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

  useEffect(() => {
    import('@google/model-viewer').catch(() => null);
  }, []);

  useEffect(() => {
    if (selectedKey && selectedKey !== selectedAsset) {
      setSelectedAsset(selectedKey);
      setLatestResult(null);
      setConversionStatus(null);
    }
  }, [selectedAsset, selectedKey]);

  const currentAsset = ASSET_TYPES.find(a => a.id === selectedAsset);
  const typeHistory = editHistory.filter(e => e.type === 'asset' && e.subType === selectedAsset);
  const directionPrompt = draftPrompts?.[selectedAsset] || currentAsset?.label || '';

  async function handleConvert() {
    setIsConverting(true);
    setLatestResult(null);
    setConversionStatus(null);
    const start = Date.now();
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
      const requestId = result?.requestId || data.requestId || null;

      if (!getModelUrl(result) && requestId) {
        setConversionStatus({
          tone: 'pending',
          label: 'Request accepted',
          detail: data.message || result.message || 'VARCO accepted the job and is preparing the 3D preview.',
          requestId
        });
        result = await pollForResult(requestId, setConversionStatus);
      }

      const latencyMs = Date.now() - start;
      const modelUrl = getModelUrl(result);
      if (!modelUrl) {
        throw new Error('3D result did not include a preview model.');
      }

      const cacheHit = Boolean(result?.cache_hit || data.cache_hit);
      dispatch({ type: 'EDIT_GENERATE', editType: 'asset', subType: selectedAsset, prompt: directionPrompt, result: { modelUrl }, latencyMs, cacheHit });
      setLatestResult({ modelUrl, latencyMs, cacheHit });
      setConversionStatus(requestId ? {
        tone: 'ready',
        label: 'Preview ready',
        detail: 'The 3D preview is ready to inspect and apply.',
        requestId
      } : null);
    } catch (e) {
      console.error('3D conversion failed:', e);
      const errorDetail = e instanceof Error ? e.message : 'Unknown conversion error';
      setConversionStatus({
        tone: 'error',
        label: e?.status && e.status !== 'processing' ? 'Conversion failed' : 'Conversion stalled',
        detail: errorDetail,
        requestId: e?.requestId || null
      });
    } finally {
      setIsConverting(false);
    }
  }

  function handleApply(historyId) {
    dispatch({ type: 'EDIT_APPLY', historyId });
  }

  return (
    <div className="asset-editor">
      <div className="card-grid">
        {ASSET_TYPES.map(asset => (
          <button
            key={asset.id}
            type="button"
            className={`card-item ${selectedAsset === asset.id ? 'selected' : ''}`}
            data-testid={`asset-card-${asset.id}`}
            onClick={() => {
              setSelectedAsset(asset.id);
              setLatestResult(null);
              setConversionStatus(null);
              onSelectKey(asset.id);
            }}
          >
            <img src={asset.imagePath} alt={asset.label} width="60" height="60" />
            <div className="card-label">{asset.label}</div>
          </button>
        ))}
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
        <div className="generation-result" data-testid="asset-generation-result">
          <model-viewer src={latestResult.modelUrl} auto-rotate camera-controls
            style={{ width: '100%', height: '180px', background: '#1a1a2e' }} />
          <div className="latency-badge">Converted in {(latestResult.latencyMs / 1000).toFixed(1)}s by VARCO3D</div>
          {latestResult.cacheHit && <div className="cache-hit-badge">cache hit</div>}
          <button className="apply-btn" onClick={() => { const e = typeHistory.at(-1); if (e) handleApply(e.id); }}>
            ✓ Apply → 게임에 즉시 반영
          </button>
        </div>
      )}

      {typeHistory.length > 0 && (
        <div className="version-history" data-testid="asset-version-history">
          <div className="version-history-title">버전 이력</div>
          {[...typeHistory].reverse().map(entry => (
            <div key={entry.id} className={`version-item ${entry.appliedAt ? 'active' : ''}`}>
              <span className="version-prompt">{entry.subType}</span>
              <span className="version-latency">{(entry.latencyMs / 1000).toFixed(1)}s</span>
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
