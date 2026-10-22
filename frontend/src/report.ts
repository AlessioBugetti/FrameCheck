import { decisionLabels, decisionOf, findingLabels, formatDuration, formatTime, reviewedCount } from './review'
import type { Decisions, Job, Playback } from './review'

export function playbackSummary(job: Job, playback: Playback): string {
  if (job.preview.status === 'failed') return `Playback unavailable. Preview preparation failed: ${job.preview.error?.message || 'The compatible preview could not be prepared.'}`
  if (playback.status === 'unavailable') return `Playback unavailable: ${playback.error || 'The browser could not display the video.'}`
  if (job.preview.status === 'running' || playback.status === 'preparing') return 'Playback pending: a compatible preview is being prepared.'
  if (playback.status !== 'ready') return 'Playback pending: browser frame readiness has not been confirmed.'
  return playback.source === 'preview' ? 'Compatible preview available for playback.' : 'Original video available for playback.'
}

export function createReport(job: Job, decisions: Decisions, playback: Playback): string {
  if (job.analysis.status !== 'complete' || !job.media) throw new Error('A report requires successful analysis.')
  const doc = document.implementation.createHTMLDocument('FrameCheck review report')
  doc.documentElement.lang = 'en'
  const meta = doc.createElement('meta')
  meta.setAttribute('charset', 'utf-8')
  doc.head.prepend(meta)
  const viewport = doc.createElement('meta')
  viewport.name = 'viewport'; viewport.content = 'width=device-width, initial-scale=1'
  doc.head.append(viewport)
  const policy = doc.createElement('meta')
  policy.httpEquiv = 'Content-Security-Policy'
  policy.content = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"
  doc.head.append(policy)
  const style = doc.createElement('style')
  style.textContent = `
    :root { font: 15px/1.6 system-ui, sans-serif; color: #202b38; background: #f0f3f7; }
    * { box-sizing: border-box; } body { max-width: 1120px; margin: 40px auto; padding: 36px; background: white; }
    h1 { font-size: 30px; line-height: 1.2; margin: 0 0 12px; } h2 { font-size: 19px; margin: 30px 0 12px; }
    .eyebrow { color: #365c87; font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
    .filename { font-size: 20px; font-weight: 600; overflow-wrap: anywhere; } p { margin: 9px 0; }
    .notice { border-left: 4px solid #8a6a18; padding: 12px 16px; background: #faf5e7; }
    dl { display: grid; grid-template-columns: 160px 1fr; gap: 8px 16px; } dt { font-weight: 600; } dd { margin: 0; overflow-wrap: anywhere; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
    th, td { text-align: left; vertical-align: top; padding: 11px 8px; border-bottom: 1px solid #c5ced9; overflow-wrap: anywhere; }
    th { background: #edf2f8; font-weight: 650; } .time { font-variant-numeric: tabular-nums; }
    .decision { font-weight: 650; } .unreviewed { color: #725300; } .problematic { color: #9b2525; }
    .settings th:first-child { width: 23%; } .settings td { white-space: pre-line; }
    footer { margin-top: 32px; border-top: 1px solid #c5ced9; padding-top: 16px; font-size: 12px; color: #48586b; }
    @media (max-width: 650px) { body { margin: 0; padding: 20px; } dl { grid-template-columns: 1fr; gap: 3px; } dd { margin-bottom: 10px; } th, td { padding: 8px 4px; font-size: 11px; } }
    @page { size: A4 landscape; margin: 14mm; }
    @media print { :root { background: white; color: black; font-size: 10pt; } h1 { font-size: 24px; } h2 { margin: 18px 0 8px; } p { margin: 6px 0; } dl { gap: 4px 16px; } th, td { padding: 7px 8px; } footer { margin-top: 16px; padding-top: 10px; } body { margin: 0; padding: 0; max-width: none; } thead { display: table-header-group; } tr, .notice, dl { break-inside: avoid; } h2 { break-after: avoid; } th { background: #eee; } .decision { color: black; } }
  `
  doc.head.append(style)
  const add = (tag: string, text: string, parent: Element = doc.body, className = '') => {
    const element = doc.createElement(tag)
    element.textContent = text
    if (className) element.className = className
    parent.append(element)
    return element
  }
  add('p', 'FrameCheck · Local analysis. Human judgment.', doc.body, 'eyebrow')
  add('h1', 'Video review report')
  add('p', job.filename, doc.body, 'filename')
  const reviewed = reviewedCount(job.findings, decisions)
  const remaining = job.findings.length - reviewed
  add('p', `${reviewed} of ${job.findings.length} reviewed · ${remaining} Unreviewed`)
  add('p', remaining > 0 ? 'Review incomplete. Unreviewed findings still require an explicit decision.' : job.findings.length > 0 ? 'All findings have explicit review decisions.' : 'No suspicious intervals detected', doc.body, remaining > 0 ? 'notice' : '')
  add('p', 'Detections are candidates for human review, not proof of a defect. Static scenes and silence can be intentional. These checks do not guarantee a defect-free video.')
  add('h2', 'Analysis and playback')
  const details = add('dl', '')
  const detail = (label: string, value: string) => { add('dt', label, details); add('dd', value, details) }
  detail('Exported at', new Date().toISOString())
  detail('Analysis', 'Completed successfully on the original video')
  detail('Duration', formatTime(job.media.duration))
  detail('File size', `${job.byte_count.toLocaleString('en-US')} bytes`)
  detail('Media', `${job.media.container.toUpperCase()} · ${job.media.video_codec.toUpperCase()} · ${job.media.width} × ${job.media.height}`)
  detail('Audio', job.media.has_audio ? (job.media.audio_codec || 'Audio track present').toUpperCase() : 'No audio track')
  detail('Playback', playbackSummary(job, playback))
  detail('Preview preparation', job.preview.status === 'failed' ? `Failed: ${job.preview.error?.message || 'Unknown preview error'}` : job.preview.status === 'complete' ? 'Completed' : job.preview.status === 'running' ? 'In progress' : 'Not requested')
  detail('Timestamp reference', `Elapsed time from the shared source origin (${job.media.source_origin.toFixed(6)} s); original and compatible preview use the same review timeline.`)
  if (job.media.ignored_streams.length) detail('Not analyzed', job.media.ignored_streams.join(', '))
  if (playback.status !== 'ready' || job.preview.status === 'failed') add('p', 'Playback was pending or unavailable at export. Review decisions record explicit classifications only; this report does not certify that a visual review was completed.', doc.body, 'notice')
  add('h2', 'Findings and review decisions')
  if (job.findings.length === 0) add('p', 'No suspicious intervals detected')
  else {
    const table = add('table', '')
    const head = add('thead', '', table)
    const row = add('tr', '', head)
    for (const label of ['Type', 'Start', 'End', 'Duration', 'Review decision']) {
      const th = add('th', label, row); th.setAttribute('scope', 'col')
    }
    const body = add('tbody', '', table)
    for (const finding of job.findings) {
      const row = add('tr', '', body)
      const decision = decisionOf(decisions, finding.id)
      add('td', findingLabels[finding.type], row)
      add('td', formatTime(finding.start), row, 'time')
      add('td', formatTime(finding.end), row, 'time')
      add('td', formatDuration(finding.duration), row, 'time')
      add('td', decisionLabels[decision], row, `decision ${decision}`)
    }
  }
  add('h2', 'Detection settings')
  const settings = add('table', '', doc.body, 'settings')
  const head = add('thead', '', settings)
  const row = add('tr', '', head)
  for (const label of ['Type', 'Actual settings']) { const th = add('th', label, row); th.setAttribute('scope', 'col') }
  const body = add('tbody', '', settings)
  const settingLabels: Record<string, string> = { minimum_duration: 'Minimum duration (s)', picture_black_ratio: 'Picture black ratio', pixel_threshold: 'Pixel threshold', noise_db: 'Noise threshold (dB)', channels: 'Channels' }
  for (const [type, values] of Object.entries(job.settings)) {
    const row = add('tr', '', body)
    add('td', findingLabels[type as keyof typeof findingLabels] || type, row)
    add('td', values && typeof values === 'object' ? Object.entries(values).map(([key, value]) => `${settingLabels[key] || key}: ${String(value)}`).join('\n') : String(values), row)
  }
  add('footer', 'Generated locally by FrameCheck. This standalone file contains the full analysis and current decisions, regardless of workspace filters. No video is embedded. Use your browser’s Print command to print or save a PDF.')
  return '<!doctype html>\n' + doc.documentElement.outerHTML
}

export function downloadReport(job: Job, decisions: Decisions, playback: Playback): void {
  const url = URL.createObjectURL(new Blob([createReport(job, decisions, playback)], { type: 'text/html;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${job.filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 100) || 'video'}-framecheck-report.html`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
