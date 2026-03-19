export default function EditHistory({ editHistory = [], dispatch }) {
  if (editHistory.length === 0) {
    return (
      <div className="edit-history empty">
        <p style={{ color: 'var(--text-dim, #888)', textAlign: 'center', padding: '20px' }}>
          아직 편집 이력이 없습니다.<br />
          🎵 Sound Editor나 🧊 Asset Editor를 사용해보세요.
        </p>
      </div>
    );
  }

  return (
    <div className="edit-history">
      {[...editHistory].reverse().map(entry => (
        <div key={entry.id} className={`version-item ${entry.appliedAt ? 'active' : ''}`}>
          <span className="entry-icon">{entry.type === 'sound' ? '🎵' : '🧊'}</span>
          <div className="entry-info">
            <span className="version-prompt">
              {entry.prompt.slice(0, 30)}{entry.prompt.length > 30 ? '...' : ''}
            </span>
            <span className="version-latency">{(entry.latencyMs / 1000).toFixed(1)}s by VARCO3D</span>
          </div>
          {entry.cacheHit && <span className="cache-hit-badge">cache</span>}
          {entry.appliedAt && <span className="applied-badge">적용됨</span>}
          <button className="apply-btn small"
            onClick={() => dispatch({ type: 'EDIT_APPLY', historyId: entry.id })}>
            Apply
          </button>
        </div>
      ))}
    </div>
  );
}
