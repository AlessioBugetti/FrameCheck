import { decisionLabels, decisionOf, findingLabels, formatTime } from './review'
import type { Decisions, Finding, FindingType } from './review'

type Props = {
  findings: Finding[]
  decisions: Decisions
  duration: number
  currentTime: number
  selectedId: string | null
  playable: boolean
  onSelect: (finding: Finding) => void
}

export default function Timeline({ findings, decisions, duration, currentTime, selectedId, playable, onSelect }: Props) {
  const position = Math.min(100, Math.max(0, (currentTime / duration) * 100))
  return <section className="timeline panel" aria-label="Findings timeline">
    <div className="section-heading"><h2>Timeline</h2><span className="small-text">Select an interval to inspect it</span></div>
    <div className="timeline-ruler" aria-hidden="true"><span />
      <div>{[0, 0.25, 0.5, 0.75, 1].map((fraction) => <span key={fraction}>{formatTime(duration * fraction)}</span>)}</div>
    </div>
    <div className="tracks">
      {(Object.keys(findingLabels) as FindingType[]).map((type) => <div className="timeline-row" key={type}>
        <span className="track-label">{findingLabels[type]}</span>
        <div className="track">
          {findings.filter((finding) => finding.type === type).map((finding) => <button
            key={finding.id}
            type="button"
            className={`interval ${decisionOf(decisions, finding.id)}${selectedId === finding.id ? ' selected' : ''}`}
            style={{ left: `${(finding.start / duration) * 100}%`, width: `${(finding.duration / duration) * 100}%` }}
            aria-label={`${findingLabels[type]}, ${formatTime(finding.start)} to ${formatTime(finding.end)}, ${decisionLabels[decisionOf(decisions, finding.id)]}`}
            aria-pressed={selectedId === finding.id}
            disabled={!playable}
            title={`${findingLabels[type]} · ${formatTime(finding.start)}–${formatTime(finding.end)}`}
            onClick={() => onSelect(finding)}
          ><span className="interval-fill" /></button>)}
          <span className="playhead" style={{ left: `${position}%` }} aria-hidden="true" />
        </div>
      </div>)}
    </div>
    <div className="timeline-footer"><span><i className="legend-square" />Unreviewed</span><span><i className="legend-square intentional" />Intentional</span><span><i className="legend-square problematic" />Problematic</span><span className="tabular">{formatTime(currentTime)}</span></div>
  </section>
}
