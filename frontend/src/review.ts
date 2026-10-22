export const findingLabels = {
  black_frames: 'Black frames',
  frozen_frames: 'Frozen frames',
  silence: 'Silence',
} as const

export type FindingType = keyof typeof findingLabels
export type Finding = {
  id: string
  type: FindingType
  start: number
  end: number
  duration: number
}

export type ApiError = { code: string; message: string }
export type Phase<Status extends string> = {
  status: Status
  progress: number | null
  error: ApiError | null
}
export type Media = {
  duration: number
  video_end: number
  audio_end: number | null
  source_origin: number
  has_audio: boolean
  container: string
  video_codec: string
  audio_codec: string | null
  width: number
  height: number
  requires_preview: boolean
  ignored_streams: string[]
}
export type Job = {
  job_id: string
  filename: string
  byte_count: number
  analysis: Phase<'validating' | 'running' | 'complete' | 'failed'>
  preview: Phase<'idle' | 'running' | 'complete' | 'failed'>
  media: Media | null
  findings: Finding[]
  settings: Record<string, unknown>
  media_urls: { original: string | null; preview: string | null }
}
export type Config = {
  limits: { max_bytes: number; max_duration: number }
  supported: { container: string; video: string; audio: string }[]
  tools: { ready: boolean; error: string | null }
  current_job: { job_id: string; filename: string; analysis_status: string } | null
}
export type Playback = {
  status: 'checking' | 'preparing' | 'ready' | 'unavailable'
  source: 'original' | 'preview' | null
  error: string | null
}

export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 1000))
  const hours = Math.floor(total / 3_600_000)
  const minutes = Math.floor(total / 60_000) % 60
  const wholeSeconds = Math.floor(total / 1000) % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(total % 1000).padStart(3, '0')}`
}

export function contextStart(finding: Finding): number {
  return Math.max(0, finding.start - 1)
}

export function formatDuration(seconds: number): string {
  return `${seconds.toFixed(3)} s`
}

export const decisionLabels = {
  unreviewed: 'Unreviewed',
  intentional: 'Intentional',
  problematic: 'Problematic',
} as const
export type Decision = keyof typeof decisionLabels
export type Decisions = Record<string, Decision>
export type Filters = { type: FindingType | 'all'; status: Decision | 'all' }

export function decisionOf(decisions: Decisions, id: string): Decision {
  return decisions[id] ?? 'unreviewed'
}

export function matchesFilters(finding: Finding, decisions: Decisions, filters: Filters): boolean {
  return (filters.type === 'all' || finding.type === filters.type)
    && (filters.status === 'all' || decisionOf(decisions, finding.id) === filters.status)
}

export function reviewedCount(findings: Finding[], decisions: Decisions): number {
  return findings.filter(finding => decisionOf(decisions, finding.id) !== 'unreviewed').length
}

export function nextUnreviewed(findings: Finding[], decisions: Decisions, filters: Filters, afterId: string | null): Finding | null {
  const cursor = findings.findIndex(finding => finding.id === afterId)
  for (let offset = 1; offset <= findings.length; offset++) {
    const finding = findings[(cursor + offset) % findings.length]
    if (decisionOf(decisions, finding.id) === 'unreviewed' && matchesFilters(finding, decisions, filters)) return finding
  }
  return null
}
