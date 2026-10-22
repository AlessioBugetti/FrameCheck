import { findingLabels, formatDuration, formatTime } from './review'
import type { Finding } from './review'

type Props = {
  findings: Finding[]
  selectedId: string | null
  onSelect: (finding: Finding) => void
}

export default function FindingsPanel({ findings, selectedId, onSelect }: Props) {
  const selected = findings.find((finding) => finding.id === selectedId)
  return <aside className="findings-panel panel" aria-label="Findings">
    <div className="findings-heading">
      <div className="section-heading"><h2>Findings <span className="count">{findings.length}</span></h2><span className="small-text">Chronological</span></div>
      <p>Candidates for human review.</p>
    </div>
    {findings.length === 0 ? <div className="findings-empty"><span className="empty-symbol" aria-hidden="true">✓</span><h3>No suspicious intervals detected</h3><p>These checks do not guarantee a defect-free video. A final watch-through can still be useful.</p></div> : <ol className="findings-list">
      {findings.map((finding, index) => <li key={finding.id}>
        <button type="button" className={`finding${selectedId === finding.id ? ' selected' : ''}`} aria-pressed={selectedId === finding.id} onClick={() => onSelect(finding)}>
          <span className="finding-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <span className="finding-content">
            <span className="finding-top"><strong>{findingLabels[finding.type]}</strong><span className="status-tag">Unreviewed</span></span>
            <span className="finding-time tabular">{formatTime(finding.start)}<span aria-label="to"> → </span>{formatTime(finding.end)}</span>
            <span className="finding-bottom"><span className="tabular">{formatDuration(finding.duration)}</span>{selectedId === finding.id && <span className="selected-label">Selected</span>}</span>
          </span>
        </button>
      </li>)}
    </ol>}
    <div className="selection-details" aria-live="polite">
      {selected ? <><div className="eyebrow">Selected interval</div><h3>{findingLabels[selected.type]}</h3><p className="tabular">{formatTime(selected.start)} — {formatTime(selected.end)}</p><div className="selection-bottom"><span>{formatDuration(selected.duration)}</span><span className="status-tag">Unreviewed</span></div></> : <><div className="eyebrow">Your next look</div><p>Select a finding to see its timestamps and watch the surrounding context.</p></>}
    </div>
  </aside>
}
