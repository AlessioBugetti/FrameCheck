import { useEffect, useRef } from 'react'
import { decisionLabels, decisionOf, findingLabels, formatDuration, formatTime } from './review'
import type { Decision, Decisions, Filters, Finding, FindingType } from './review'

type Props = {
  findings: Finding[]
  total: number
  decisions: Decisions
  filters: Filters
  onFilters: (filters: Filters) => void
  selectedId: string | null
  onSelect: (finding: Finding) => void
  onDecision: (decision: Decision) => void
  nextEnabled: boolean
  onNext: () => void
}

export default function FindingsPanel({ findings, total, decisions, filters, onFilters, selectedId, onSelect, onDecision, nextEnabled, onNext }: Props) {
  const selected = findings.find((finding) => finding.id === selectedId)
  const list = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const container = list.current
    const selected = container?.querySelector('[aria-pressed="true"]')
    if (!container || !selected) return
    const bounds = container.getBoundingClientRect()
    const item = selected.getBoundingClientRect()
    if (item.top < bounds.top) container.scrollTop += item.top - bounds.top - 8
    else if (item.bottom > bounds.bottom) container.scrollTop += item.bottom - bounds.bottom + 8
  }, [selectedId])
  const nextButton = useRef<HTMLButtonElement>(null)
  const statusFilter = useRef<HTMLSelectElement>(null)
  function classify(decision: Decision) {
    onDecision(decision)
    if (filters.status !== 'all' && filters.status !== decision) {
      // Keep keyboard focus useful when the selected action disappears.
      window.setTimeout(() => (nextButton.current?.disabled ? statusFilter.current : nextButton.current)?.focus(), 0)
    }
  }
  return <aside className="findings-panel panel" aria-label="Findings">
    <div className="findings-heading">
      <div className="section-heading"><h2>Findings <span className="count">{findings.length} / {total}</span></h2><span className="small-text">Chronological</span></div>
      <p>Candidates for human review.</p>
      <div className="finding-filters">
        <label><span id="type-filter-label">Type</span><select aria-labelledby="type-filter-label" value={filters.type} onChange={event => onFilters({ ...filters, type: event.target.value as FindingType | 'all' })}><option value="all">All types</option>{Object.entries(findingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span id="status-filter-label">Review status</span><select aria-labelledby="status-filter-label" ref={statusFilter} value={filters.status} onChange={event => onFilters({ ...filters, status: event.target.value as Decision | 'all' })}><option value="all">All statuses</option>{Object.entries(decisionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
    </div>
    {total === 0 ? <div className="findings-empty"><span className="empty-symbol" aria-hidden="true">✓</span><h3>No suspicious intervals detected</h3><p>These checks do not guarantee a defect-free video. A final watch-through can still be useful.</p></div> : findings.length === 0 ? <div className="findings-empty"><h3>No findings match these filters</h3><p>Change the filters to see other findings. Your decisions are preserved.</p></div> : <ol ref={list} className="findings-list">
      {findings.map((finding) => <li key={finding.id}>
        <button type="button" className={`finding${selectedId === finding.id ? ' selected' : ''}`} aria-pressed={selectedId === finding.id} onClick={() => onSelect(finding)}>
          <span className="finding-content">
            <span className="finding-top"><strong>{findingLabels[finding.type]}</strong><span className={`status-tag ${decisionOf(decisions, finding.id)}`}>{decisionLabels[decisionOf(decisions, finding.id)]}</span></span>
            <span className="finding-time tabular">{formatTime(finding.start)}<span aria-label="to"> → </span>{formatTime(finding.end)}</span>
            <span className="finding-bottom"><span className="tabular">{formatDuration(finding.duration)}</span>{selectedId === finding.id && <span className="selected-label">Selected</span>}</span>
          </span>
        </button>
      </li>)}
    </ol>}
    <div className="selection-details">
      <div aria-live="polite">{selected ? <><div className="eyebrow">Selected interval</div><h3>{findingLabels[selected.type]}</h3><p className="tabular">{formatTime(selected.start)} — {formatTime(selected.end)}</p><div className="selection-bottom"><span>{formatDuration(selected.duration)}</span><span className={`status-tag ${decisionOf(decisions, selected.id)}`}>{decisionLabels[decisionOf(decisions, selected.id)]}</span></div></> : <><div className="eyebrow">{total === 0 ? 'No intervals to review' : 'Your next look'}</div><p>{total === 0 ? 'Export the analysis report, or load another video.' : 'Select a finding to see its timestamps and watch the surrounding context.'}</p></>}</div>
      {selected && <div className="decision-actions"><button type="button" aria-pressed={decisionOf(decisions, selected.id) === 'intentional'} onClick={() => classify('intentional')}>Mark as intentional</button><button type="button" aria-pressed={decisionOf(decisions, selected.id) === 'problematic'} onClick={() => classify('problematic')}>Mark as problematic</button><button type="button" className="restore-decision" disabled={decisionOf(decisions, selected.id) === 'unreviewed'} onClick={() => classify('unreviewed')}>Restore to unreviewed</button></div>}
      <button ref={nextButton} className="next-finding primary" type="button" disabled={!nextEnabled} onClick={onNext}>Next unreviewed <span aria-hidden="true">→</span></button>
    </div>
  </aside>
}
