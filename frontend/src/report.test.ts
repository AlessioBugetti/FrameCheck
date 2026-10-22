import { describe, expect, it } from 'vitest'
import { playbackSummary } from './report'
import type { Job, Playback } from './review'

const job: Job = {
  job_id: 'test', filename: 'video.mp4', byte_count: 100,
  analysis: { status: 'complete', progress: 1, error: null },
  preview: { status: 'idle', progress: null, error: null },
  media: null, findings: [], settings: {}, media_urls: { original: null, preview: null },
}
const checking: Playback = { status: 'checking', source: 'original', error: null }

describe('report playback disclosure', () => {
  it('does not treat a completed encode as confirmed playback', () => {
    expect(playbackSummary({ ...job, preview: { status: 'complete', progress: 1, error: null } }, checking)).toContain('readiness has not been confirmed')
  })
  it('discloses server preparation failure and browser failure', () => {
    expect(playbackSummary({ ...job, preview: { status: 'failed', progress: null, error: { code: 'preview_failed', message: 'Disk full' } } }, checking)).toContain('Preview preparation failed: Disk full')
    expect(playbackSummary(job, { status: 'unavailable', source: 'preview', error: 'No browser frame' })).toContain('Playback unavailable: No browser frame')
  })
  it('identifies preparation, original playback and compatible preview playback', () => {
    expect(playbackSummary(job, { status: 'preparing', source: 'preview', error: null })).toContain('being prepared')
    expect(playbackSummary(job, { status: 'ready', source: 'original', error: null })).toBe('Original video available for playback.')
    expect(playbackSummary(job, { status: 'ready', source: 'preview', error: null })).toBe('Compatible preview available for playback.')
  })
})
