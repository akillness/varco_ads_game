import { useState } from 'react';

const SOUND_TYPES = [
  { id: 'bgm', label: 'BGM', prompt: 'ambient game background music' },
  { id: 'orb', label: 'Orb 수집음', prompt: 'collect orb pickup sound' },
  { id: 'hit', label: '적 충돌음', prompt: 'enemy collision impact sound' },
  { id: 'win', label: '승리음', prompt: 'victory fanfare sound' },
  { id: 'lose', label: '패배음', prompt: 'game over defeat sound' },
];

export default function SoundEditor({ editHistory = [], dispatch, studioPack = null, draftPrompts = {}, onDraftChange = () => {} }) {
  const [activeTab, setActiveTab] = useState('bgm');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [latestResult, setLatestResult] = useState(null); // { audioUrl, latencyMs, id }

  const currentType = SOUND_TYPES.find(t => t.id === activeTab);
  const typeHistory = editHistory.filter(e => e.type === 'sound' && e.subType === activeTab);
  const appliedEntry = [...typeHistory].reverse().find(e => e.appliedAt);

  const displayPrompt = prompt || draftPrompts?.[activeTab] || appliedEntry?.prompt || currentType?.prompt || '';

  async function handleRegenerate() {
    setIsGenerating(true);
    const start = Date.now();
    try {
      const res = await fetch('/api/varco/text2sound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: displayPrompt, version: 'v1', num_sample: 1 }),
      });
      const data = await res.json();
      const latencyMs = Date.now() - start;
      const audioUrl = data.result?.data?.[0]?.audio || data.data?.[0]?.audio || '';
      const id = data.result?.version_id || data.version_id || Date.now().toString();
      const cacheHit = Boolean(data.result?.cache_hit || data.cache_hit);

      dispatch({ type: 'EDIT_GENERATE', editType: 'sound', subType: activeTab, prompt: displayPrompt, result: { audioUrl }, latencyMs, cacheHit });
      setLatestResult({ audioUrl, latencyMs, id, cacheHit });
    } catch (e) {
      console.error('Sound generation failed:', e);
    } finally {
      setIsGenerating(false);
    }
  }

  function handleApply(historyId) {
    dispatch({ type: 'EDIT_APPLY', historyId });
  }

  return (
    <div className="sound-editor">
      <div className="sound-type-tabs">
        {SOUND_TYPES.map(t => (
          <button key={t.id} className={`sound-tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => { setActiveTab(t.id); setPrompt(draftPrompts?.[t.id] || ''); setLatestResult(null); }}>
            {t.label}
          </button>
        ))}
      </div>

      {studioPack && (
        <div className="studio-inline-callout">
          <strong>{studioPack.heroName}</strong>
          <span>{studioPack.campaign.headline}</span>
        </div>
      )}

      <div className="prompt-section">
        <label className="prompt-label">프롬프트</label>
        <input
          className="prompt-input"
          value={displayPrompt}
          onChange={e => {
            setPrompt(e.target.value);
            onDraftChange(activeTab, e.target.value);
          }}
          placeholder={currentType?.prompt}
        />
        <button className="regenerate-btn" onClick={handleRegenerate} disabled={isGenerating}>
          {isGenerating ? '⏳ Generating...' : '▶ 재생성'}
        </button>
      </div>

      {latestResult && (
        <div className="generation-result" data-testid="sound-generation-result">
          <audio controls src={latestResult.audioUrl} style={{ width: '100%' }} />
          <div className="latency-badge">Generated in {(latestResult.latencyMs / 1000).toFixed(1)}s by VARCO3D</div>
          {latestResult.cacheHit && <div className="cache-hit-badge">cache hit</div>}
          <button className="apply-btn" onClick={() => {
            const entry = editHistory.filter(e => e.type === 'sound' && e.subType === activeTab).at(-1);
            if (entry) handleApply(entry.id);
          }}>
            ✓ Apply → 게임에 즉시 반영
          </button>
        </div>
      )}

      {typeHistory.length > 0 && (
        <div className="version-history" data-testid="sound-version-history">
          <div className="version-history-title">버전 이력</div>
          {[...typeHistory].reverse().map(entry => (
            <div key={entry.id} className={`version-item ${entry.appliedAt ? 'active' : ''}`}>
              <span className="version-prompt">{entry.prompt.slice(0, 30)}{entry.prompt.length > 30 ? '...' : ''}</span>
              <span className="version-latency">{(entry.latencyMs / 1000).toFixed(1)}s</span>
              {entry.cacheHit && <span className="cache-hit-badge">cache</span>}
              {entry.appliedAt && <span className="applied-badge">적용됨</span>}
              {entry.result?.audioUrl && <audio controls src={entry.result.audioUrl} style={{ width: '80px', height: '24px' }} />}
              <button className="apply-btn small" onClick={() => handleApply(entry.id)}>Apply</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
