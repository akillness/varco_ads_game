import { useEffect, useState } from 'react';

const ASSET_TYPES = [
  { id: 'orb', label: 'Orb', imagePath: '/cards/orb.svg' },
  { id: 'enemy', label: 'Enemy', imagePath: '/cards/enemy.svg' },
  { id: 'player', label: 'Player', imagePath: '/cards/player.svg' },
];

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

  useEffect(() => {
    import('@google/model-viewer').catch(() => null);
  }, []);

  useEffect(() => {
    if (selectedKey && selectedKey !== selectedAsset) {
      setSelectedAsset(selectedKey);
      setLatestResult(null);
    }
  }, [selectedAsset, selectedKey]);

  const currentAsset = ASSET_TYPES.find(a => a.id === selectedAsset);
  const typeHistory = editHistory.filter(e => e.type === 'asset' && e.subType === selectedAsset);
  const directionPrompt = draftPrompts?.[selectedAsset] || currentAsset?.label || '';

  async function handleConvert() {
    setIsConverting(true);
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
      if (!result?.data?.[0]?.model_url && result?.requestId) {
        const resultRes = await fetch(`/api/varco/image-to-3d/result/${result.requestId}`);
        const resultJson = await resultRes.json();
        result = resultJson.result || result;
      }
      const latencyMs = Date.now() - start;
      const modelUrl = result?.data?.[0]?.model_url || result?.model_url || '';
      const cacheHit = Boolean(result?.cache_hit || data.cache_hit);
      dispatch({ type: 'EDIT_GENERATE', editType: 'asset', subType: selectedAsset, prompt: directionPrompt, result: { modelUrl }, latencyMs, cacheHit });
      setLatestResult({ modelUrl, latencyMs, cacheHit });
    } catch (e) {
      console.error('3D conversion failed:', e);
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
