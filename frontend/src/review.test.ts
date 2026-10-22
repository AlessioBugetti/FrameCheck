import { describe, expect, it } from 'vitest'
import { contextStart, formatTime } from './review'

describe('review timestamps', () => {
  it('rounds at a minute boundary without displaying 60 seconds', () => {
    expect(formatTime(59.9996)).toBe('00:01:00.000')
    expect(formatTime(3601.002)).toBe('01:00:01.002')
  })
  it('keeps one second of context and clamps findings near the beginning', () => {
    const finding = { id: 'one', type: 'black_frames' as const, start: 0.2, end: 2, duration: 1.8 }
    expect(contextStart(finding)).toBe(0)
    expect(contextStart({ ...finding, start: 6 })).toBe(5)
  })
})

import { decisionOf, matchesFilters, nextUnreviewed, reviewedCount } from './review'
import type { Decision, Finding } from './review'
const findings: Finding[] = [
  { id: 'a', type: 'black_frames', start: 2, end: 3, duration: 1 },
  { id: 'b', type: 'frozen_frames', start: 2, end: 3, duration: 1 },
  { id: 'c', type: 'silence', start: 9, end: 12, duration: 3 },
]
const all = { type: 'all', status: 'all' } as const

describe('deliberate review navigation', () => {
  it('defaults to unreviewed and counts every explicit decision independently of filters', () => {
    expect(decisionOf({}, 'a')).toBe('unreviewed')
    for (const previous of ['unreviewed', 'intentional', 'problematic'] as Decision[]) {
      for (const next of ['unreviewed', 'intentional', 'problematic'] as Decision[]) {
        const decisions = { ...{ a: previous }, a: next }
        expect(decisionOf(decisions, 'a')).toBe(next)
        expect(reviewedCount(findings, decisions)).toBe(next === 'unreviewed' ? 0 : 1)
      }
    }
    expect(reviewedCount(findings, { a: 'intentional', c: 'problematic', stale: 'problematic' })).toBe(2)
  })
  it('preserves chronological tie order and combines both filters', () => {
    const decisions = { a: 'intentional' as const }
    expect(findings.filter(f => matchesFilters(f, decisions, all)).map(f => f.id)).toEqual(['a', 'b', 'c'])
    expect(findings.filter(f => matchesFilters(f, decisions, { type: 'black_frames', status: 'unreviewed' }))).toEqual([])
    expect(findings.filter(f => matchesFilters(f, decisions, { type: 'all', status: 'unreviewed' })).map(f => f.id)).toEqual(['b', 'c'])
  })
  it('starts at the beginning, searches forward from a removed selection and wraps', () => {
    expect(nextUnreviewed(findings, {}, all, null)?.id).toBe('a')
    expect(nextUnreviewed(findings, { a: 'intentional' }, all, 'a')?.id).toBe('b')
    expect(nextUnreviewed(findings, {}, all, 'c')?.id).toBe('a')
    expect(nextUnreviewed(findings, {}, { type: 'silence', status: 'unreviewed' }, 'c')?.id).toBe('c')
  })
  it('returns no destination when filters exclude pending work or all findings are reviewed', () => {
    expect(nextUnreviewed(findings, {}, { ...all, status: 'problematic' }, null)).toBeNull()
    expect(nextUnreviewed(findings, { a: 'intentional', b: 'problematic', c: 'intentional' }, all, null)).toBeNull()
    expect(nextUnreviewed([], {}, all, null)).toBeNull()
  })
})
