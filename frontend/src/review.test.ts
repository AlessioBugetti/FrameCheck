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
