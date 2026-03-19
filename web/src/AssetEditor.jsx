import { useState } from 'react';

const ASSET_TYPES = [
  { id: 'orb', label: 'Orb', imagePath: '/cards/orb.svg' },
  { id: 'enemy', label: 'Enemy', imagePath: '/cards/enemy.svg' },
  { id: 'player', label: 'Player', imagePath: '/cards/player.svg' },
];

export default function AssetEditor({ editHistory = [], dispatch, studioPack = null, draftPrompts = {}, onDraftChange = () => {} }) {
  const [selectedAsset, setSelectedAsset] = useState('orb');
  const [isConverting, setIsConverting] = useState(false);
  const [latestResult, setLatestResult] = useState(null);

  const currentAsset = ASSET_TYPES.find(a => a.id === selectedAsset);
  const typeHistory = editHistory.filter(e => e.type === 'asset' && e.subType === selectedAsset);
  const directionPrompt = draftPrompts?.[selectedAsset] || currentAsset?.label || '';

  async function handleConvert() {
    setIsConverting(true);
    const start = Date.now();
    try {
      const imageUrl = window.location.origin + currentAsset.imagePath;
      const res = await fetch('/api/varco/image-to-3d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: imageUrl }),
      });
      const data = await res.json();
      const latencyMs = Date.now() - start;
      const modelUrl = data.result?.data?.[0]?.model_url || data.data?.[0]?.model_url || '';
      dispatch({ type: 'EDIT_GENERATE', editType: 'asset', subType: selectedAsset, prompt: directionPrompt, result: { modelUrl }, latencyMs });
      setLatestResult({ modelUrl, latencyMs });
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
          <div key={asset.id} className={`card-item ${selectedAsset === asset.id ? 'selected' : ''}`}
            onClick={() => { setSelectedAsset(asset.id); setLatestResult(null); }}>
            <img src={asset.imagePath} alt={asset.label} width="60" height="60" />
            <div className="card-label">{asset.label}</div>
          </div>
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
              {entry.appliedAt && <span className="applied-badge">적용됨</span>}
              <button className="apply-btn small" onClick={() => handleApply(entry.id)}>Apply</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
