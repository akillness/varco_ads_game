function truncatePrompt(prompt = '') {
  return `${prompt.slice(0, 30)}${prompt.length > 30 ? '...' : ''}`;
}

function getEntryTypeLabel(entry) {
  if (entry.type === 'sound') {
    return `${entry.subType || 'sound'} sound`;
  }
  return `${entry.subType || 'asset'} asset`;
}

function getHistoryEntryAriaLabel(entry, index, total) {
  const parts = [
    `Edit history ${index + 1} of ${total}.`,
    `${getEntryTypeLabel(entry)} version ${entry.versionNum || index + 1}.`,
    `Prompt ${truncatePrompt(entry.prompt || '')}.`,
    `${((entry.latencyMs || 0) / 1000).toFixed(1)} seconds by VARCO3D.`
  ];

  if (entry.cacheHit) {
    parts.push('Cache hit.');
  }

  if (entry.appliedAt) {
    parts.push('Currently applied.');
  } else {
    parts.push('Press Enter or Space to apply this version.');
  }

  return parts.join(' ');
}

function focusHistoryEntry(entryId) {
  if (typeof document === 'undefined') return;
  window.requestAnimationFrame(() => {
    document.querySelector(`[data-history-entry-id="${entryId}"]`)?.focus();
  });
}

function handleHistoryEntryKeyDown(event, currentId, entries, onApply) {
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

    focusHistoryEntry(entries[nextIndex].id);
    return;
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onApply(currentId);
  }
}

export default function EditHistory({ editHistory = [], dispatch }) {
  const displayedHistory = [...editHistory].reverse();

  if (displayedHistory.length === 0) {
    return (
      <div className="edit-history empty">
        <p style={{ color: 'var(--text-dim, #888)', textAlign: 'center', padding: '20px' }}>
          아직 편집 이력이 없습니다.<br />
          🎵 Sound Editor나 🧊 Asset Editor를 사용해보세요.
        </p>
      </div>
    );
  }

  function applyHistoryEntry(historyId) {
    dispatch({ type: 'EDIT_APPLY', historyId });
  }

  return (
    <div className="edit-history" data-testid="edit-history-list" role="group" aria-label="Edit history list">
      {displayedHistory.map((entry, index) => {
        const ariaLabel = getHistoryEntryAriaLabel(entry, index, displayedHistory.length);
        return (
          <div
            key={entry.id}
            className={`version-item ${entry.appliedAt ? 'active' : ''}`}
            data-testid="edit-history-entry"
            data-history-entry-id={entry.id}
            role="group"
            tabIndex={0}
            aria-description={ariaLabel}
            title={ariaLabel}
            onKeyDown={(event) => handleHistoryEntryKeyDown(event, entry.id, displayedHistory, applyHistoryEntry)}
          >
            <span className="entry-icon" aria-hidden="true">{entry.type === 'sound' ? '🎵' : '🧊'}</span>
            <div className="entry-info">
              <span className="version-prompt">
                {truncatePrompt(entry.prompt || '')}
              </span>
              <span className="version-latency">{((entry.latencyMs || 0) / 1000).toFixed(1)}s by VARCO3D</span>
            </div>
            {entry.cacheHit && <span className="cache-hit-badge">cache</span>}
            {entry.appliedAt && <span className="applied-badge">적용됨</span>}
            <button
              type="button"
              className="apply-btn small"
              data-testid="edit-history-apply"
              onClick={() => applyHistoryEntry(entry.id)}
            >
              Apply
            </button>
          </div>
        );
      })}
    </div>
  );
}
