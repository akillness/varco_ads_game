import { useEffect, useRef, useState } from 'react';

function createSoundGenerationError(message, details = {}) {
  const error = new Error(message);
  Object.assign(error, details);
  return error;
}

const SOUND_TYPES = [
  { id: 'bgm', label: 'BGM', prompt: 'ambient game background music' },
  { id: 'orb', label: 'Orb 수집음', prompt: 'collect orb pickup sound' },
  { id: 'hit', label: '적 충돌음', prompt: 'enemy collision impact sound' },
  { id: 'win', label: '승리음', prompt: 'victory fanfare sound' },
  { id: 'lose', label: '패배음', prompt: 'game over defeat sound' },
];

function getSoundTabAriaLabel(label, isActive) {
  return isActive
    ? `Show the ${label} sound cue editor; currently selected.`
    : `Show the ${label} sound cue editor.`;
}

function focusSoundTabButton(tabId) {
  if (typeof document === 'undefined') return;
  window.requestAnimationFrame(() => {
    document.querySelector(`[data-testid="sound-tab-${tabId}"]`)?.focus();
  });
}

function truncatePrompt(prompt = '') {
  return `${prompt.slice(0, 30)}${prompt.length > 30 ? '...' : ''}`;
}

function getVersionEntryAriaLabel(entry, index, total) {
  const parts = [
    `Sound version ${index + 1} of ${total}.`,
    `Prompt ${truncatePrompt(entry.prompt || '')}.`,
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

function getVersionEntryAriaDescription(entry) {
  if (entry.appliedAt) {
    return 'Currently applied.';
  }
  return 'Press Enter or Space to apply this sound version.';
}

function focusVersionEntry(entryId) {
  if (typeof document === 'undefined') return;
  window.requestAnimationFrame(() => {
    document.querySelector(`[data-sound-version-id="${entryId}"]`)?.focus();
  });
}

function handleVersionEntryKeyDown(event, currentId, entries, onApply) {
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

    focusVersionEntry(entries[nextIndex].id);
    return;
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onApply(currentId);
  }
}

function getLatestSoundResultAriaLabel(result, soundLabel) {
  const parts = [
    `Latest ${soundLabel} sound result.`,
    `${((result?.latencyMs || 0) / 1000).toFixed(1)} seconds by VARCO3D.`
  ];

  if (result?.cacheHit) {
    parts.push('Cache hit.');
  }

  parts.push('Contains an audio preview and an apply action.');
  return parts.join(' ');
}

function getLatestSoundResultAriaDescription(soundLabel) {
  return `Press Enter or Space to apply the latest ${soundLabel} sound result.`;
}

function getSoundGenerationStatusAriaLabel(status, soundLabel) {
  if (!status) {
    return 'Sound generation status unavailable.';
  }

  const toneLabel = {
    pending: 'Pending',
    ready: 'Ready',
    error: 'Error'
  }[status.tone] || 'Update';

  const parts = [
    'Sound generation status.',
    toneLabel + '.',
    `${soundLabel} cue.`,
    `${status.label}.`,
    status.detail
  ];

  if (status.resultId) {
    parts.push(`Result ID ${status.resultId}.`);
  }

  return parts.join(' ');
}

function handleLatestSoundResultKeyDown(event, onApply) {
  if (event.target !== event.currentTarget) {
    return;
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onApply();
  }
}

function handleSoundTabArrowKeyDown(event, currentId, onSelect) {
  const navigationKeys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!navigationKeys.includes(event.key) || SOUND_TYPES.length < 2) {
    return;
  }

  const currentIndex = SOUND_TYPES.findIndex((type) => type.id === currentId);
  if (currentIndex < 0) return;

  event.preventDefault();

  let nextIndex = currentIndex;
  if (event.key === 'ArrowRight') {
    nextIndex = (currentIndex + 1) % SOUND_TYPES.length;
  } else if (event.key === 'ArrowLeft') {
    nextIndex = (currentIndex - 1 + SOUND_TYPES.length) % SOUND_TYPES.length;
  } else if (event.key === 'Home') {
    nextIndex = 0;
  } else if (event.key === 'End') {
    nextIndex = SOUND_TYPES.length - 1;
  }

  const nextType = SOUND_TYPES[nextIndex];
  onSelect(nextType.id);
  focusSoundTabButton(nextType.id);
}

export default function SoundEditor({
  editHistory = [],
  dispatch,
  studioPack = null,
  draftPrompts = {},
  selectedKey = 'bgm',
  onSelectKey = () => {},
  onDraftChange = () => {}
}) {
  const [activeTab, setActiveTab] = useState(selectedKey);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [latestResult, setLatestResult] = useState(null); // { audioUrl, latencyMs, id }
  const [generationStatus, setGenerationStatus] = useState(null);
  const generationTokenRef = useRef(0);

  const currentType = SOUND_TYPES.find(t => t.id === activeTab);
  const typeHistory = editHistory.filter(e => e.type === 'sound' && e.subType === activeTab);
  const appliedEntry = [...typeHistory].reverse().find(e => e.appliedAt);

  function resetTransientState({ cancelInFlight = false } = {}) {
    if (cancelInFlight) {
      generationTokenRef.current += 1;
      setIsGenerating(false);
    }
    setLatestResult(null);
    setGenerationStatus(null);
  }

  useEffect(() => {
    if (selectedKey && selectedKey !== activeTab) {
      setActiveTab(selectedKey);
      setPrompt(draftPrompts?.[selectedKey] || '');
      resetTransientState({ cancelInFlight: true });
    }
  }, [activeTab, draftPrompts, selectedKey]);

  const displayPrompt = prompt || draftPrompts?.[activeTab] || appliedEntry?.prompt || currentType?.prompt || '';

  async function handleRegenerate() {
    const generationToken = generationTokenRef.current + 1;
    generationTokenRef.current = generationToken;
    setIsGenerating(true);
    setLatestResult(null);
    setGenerationStatus({
      tone: 'pending',
      label: 'Generating sound',
      detail: 'VARCO is building a reusable sound cue from the current prompt.',
      resultId: null
    });

    const start = Date.now();
    const activeTabAtStart = activeTab;
    const promptAtStart = displayPrompt;
    const isActiveGeneration = () => generationTokenRef.current === generationToken;
    const applyIfActive = (callback) => {
      if (!isActiveGeneration()) return;
      callback();
    };

    try {
      const res = await fetch('/api/varco/text2sound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptAtStart, version: 'v1', num_sample: 1 }),
      });
      const data = await res.json();
      const latencyMs = Date.now() - start;
      const audioUrl = data.result?.data?.[0]?.audio || data.data?.[0]?.audio || '';
      const responseMeta = data?.data || data?.result?.data?.[0] || null;
      const id =
        data.result?.version_id ||
        data.version_id ||
        data.result?.requestId ||
        data.requestId ||
        responseMeta?.version_id ||
        responseMeta?.requestId ||
        null;
      const cacheHit = Boolean(data.result?.cache_hit || data.cache_hit);

      if (!res.ok || data?.ok === false) {
        throw createSoundGenerationError(
          data?.message || `Sound generation failed (${res.status})`,
          { resultId: id }
        );
      }

      if (!audioUrl) {
        throw createSoundGenerationError('Sound result did not include an audio preview.', {
          resultId: id
        });
      }

      applyIfActive(() => {
        dispatch({ type: 'EDIT_GENERATE', editType: 'sound', subType: activeTabAtStart, prompt: promptAtStart, result: { audioUrl }, latencyMs, cacheHit });
        setLatestResult({ audioUrl, latencyMs, id, cacheHit });
        setGenerationStatus({
          tone: 'ready',
          label: 'Sound ready',
          detail: 'The generated cue is ready to preview and apply.',
          resultId: id
        });
      });
    } catch (e) {
      if (isActiveGeneration()) {
        console.error('Sound generation failed:', e);
      }
      const errorDetail = e instanceof Error ? e.message : 'Unknown sound generation error';
      applyIfActive(() => {
        setGenerationStatus({
          tone: 'error',
          label: 'Sound generation failed',
          detail: errorDetail,
          resultId: e?.resultId || null
        });
      });
    } finally {
      applyIfActive(() => setIsGenerating(false));
    }
  }

  function handleApply(historyId) {
    dispatch({ type: 'EDIT_APPLY', historyId });
  }

  function applyLatestResult() {
    const entry = editHistory.filter(e => e.type === 'sound' && e.subType === activeTab).at(-1);
    if (entry) {
      handleApply(entry.id);
    }
  }

  function selectSoundTab(tabId) {
    setActiveTab(tabId);
    setPrompt(draftPrompts?.[tabId] || '');
    resetTransientState({ cancelInFlight: true });
    onSelectKey(tabId);
  }

  return (
    <div className="sound-editor">
      <div className="sound-type-tabs" data-testid="sound-tab-group">
        {SOUND_TYPES.map(t => {
          const isActive = activeTab === t.id;
          return (
          <button
            key={t.id}
            type="button"
            className={`sound-tab-btn ${isActive ? 'active' : ''}`}
            data-testid={`sound-tab-${t.id}`}
            aria-pressed={isActive}
            aria-description={getSoundTabAriaLabel(t.label, isActive)}
            title={getSoundTabAriaLabel(t.label, isActive)}
            onClick={() => {
              selectSoundTab(t.id);
            }}
            onKeyDown={(event) => handleSoundTabArrowKeyDown(event, t.id, selectSoundTab)}
          >
            {t.label}
          </button>
          );
        })}
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

      {generationStatus && (
        <div
          className={`conversion-status conversion-status-${generationStatus.tone}`}
          data-testid="sound-generation-status"
          role="status"
          aria-live="polite"
          tabIndex={0}
          aria-label={getSoundGenerationStatusAriaLabel(generationStatus, currentType?.label || activeTab)}
          title={getSoundGenerationStatusAriaLabel(generationStatus, currentType?.label || activeTab)}
        >
          <strong>{generationStatus.label}</strong>
          <span>{generationStatus.detail}</span>
          {generationStatus.resultId && <code>{generationStatus.resultId}</code>}
        </div>
      )}

      {latestResult && (
        <div
          className="generation-result"
          data-testid="sound-generation-result"
          role="group"
          tabIndex={0}
          aria-label={getLatestSoundResultAriaLabel(latestResult, currentType?.label || activeTab)}
          aria-description={getLatestSoundResultAriaDescription(currentType?.label || activeTab)}
          title={getLatestSoundResultAriaLabel(latestResult, currentType?.label || activeTab)}
          onKeyDown={(event) => handleLatestSoundResultKeyDown(event, applyLatestResult)}
        >
          <audio
            controls
            src={latestResult.audioUrl}
            aria-label={`Latest ${currentType?.label || activeTab} sound preview`}
            title={`Latest ${currentType?.label || activeTab} sound preview`}
            style={{ width: '100%' }}
          />
          <div className="latency-badge">Generated in {(latestResult.latencyMs / 1000).toFixed(1)}s by VARCO3D</div>
          {latestResult.cacheHit && <div className="cache-hit-badge">cache hit</div>}
          <button
            className="apply-btn"
            type="button"
            aria-label={`Apply latest ${currentType?.label || activeTab} sound result to the game`}
            title={`Apply latest ${currentType?.label || activeTab} sound result to the game`}
            onClick={applyLatestResult}
          >
            ✓ Apply → 게임에 즉시 반영
          </button>
        </div>
      )}

      {typeHistory.length > 0 && (
        <div className="version-history" data-testid="sound-version-history" role="group" aria-label="Sound version history list">
          <div className="version-history-title">버전 이력</div>
          {[...typeHistory].reverse().map((entry, index, entries) => (
            <div
              key={entry.id}
              className={`version-item ${entry.appliedAt ? 'active' : ''}`}
              data-testid="sound-version-entry"
              data-sound-version-id={entry.id}
              role="group"
              tabIndex={0}
              aria-label={getVersionEntryAriaLabel(entry, index, entries.length)}
              aria-description={getVersionEntryAriaDescription(entry)}
              title={getVersionEntryAriaLabel(entry, index, entries.length)}
              onKeyDown={(event) => handleVersionEntryKeyDown(event, entry.id, entries, handleApply)}
            >
              <span className="version-prompt">{truncatePrompt(entry.prompt || '')}</span>
              <span className="version-latency">{((entry.latencyMs || 0) / 1000).toFixed(1)}s</span>
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
