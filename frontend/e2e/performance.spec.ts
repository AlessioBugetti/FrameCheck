import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const fixture = process.env.FRAMECHECK_PERFORMANCE_FIXTURE

test('near-limit original and generated preview align at start, middle and end', async ({ page, request }) => {
  test.skip(!fixture, 'Run scripts/validate_performance.py first and set FRAMECHECK_PERFORMANCE_FIXTURE to its near-limit.mp4.')
  test.setTimeout(180_000)
  const config = await (await request.get('/api/config')).json()
  if (config.current_job) await request.delete(`/api/jobs/${config.current_job.job_id}`)
  await page.goto('/')
  const uploaded = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/api/jobs?'))
  await page.locator('input[type=file]').setInputFiles(fixture!)
  const uploadResponse = await uploaded
  expect(uploadResponse.status()).toBe(202)
  let firstOriginal = true
  await page.route('**/media/original', route => {
    if (firstOriginal) { firstOriginal = false; return route.abort() }
    return route.continue()
  })
  await expect(page.getByText('Compatible preview', { exact: true })).toBeVisible({ timeout: 120_000 })
  await expect(page.locator('video')).toHaveAttribute('controls', '')
  await expect(page.getByRole('heading', { name: 'No suspicious intervals detected' })).toBeVisible()
  const current = await (await request.get('/api/config')).json()
  const job = await (await request.get(`/api/jobs/${current.current_job.job_id}`)).json()
  const results = await page.locator('video').evaluate(async (preview: HTMLVideoElement, originalUrl: string) => {
    const original = document.createElement('video')
    original.preload = 'auto'; original.muted = true; original.src = originalUrl
    document.body.append(original)
    const sample = async (video: HTMLVideoElement, position: number) => {
      video.pause()
      const mediaTime = await new Promise<number>((done, reject) => {
        const timer = setTimeout(() => reject(new Error('Frame not presented at the requested landmark')), 15_000)
        video.requestVideoFrameCallback((_, metadata) => { clearTimeout(timer); done(metadata.mediaTime) })
        video.currentTime = position
      })
      const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 54
      const context = canvas.getContext('2d')!
      context.drawImage(video, 0, 0, 96, 54)
      return { pixels: Array.from(context.getImageData(0, 0, 96, 54).data), mediaTime }
    }
    try {
      await new Promise<void>((done, reject) => { original.onloadeddata = () => done(); original.onerror = () => reject(new Error('Reference video could not load')) })
      const results = []
      for (const position of [1, 149.8, 298.8]) {
        const a = await sample(original, position), b = await sample(preview, position)
        results.push({ position, originalTime: a.mediaTime, previewTime: b.mediaTime, meanPixelDifference: a.pixels.reduce((sum, n, i) => sum + Math.abs(n - b.pixels[i]), 0) / a.pixels.length })
      }
      return results
    } finally { original.pause(); original.removeAttribute('src'); original.load(); original.remove() }
  }, job.media_urls.original)
  for (const result of results) {
    expect(Math.abs(result.originalTime - result.previewTime)).toBeLessThanOrEqual(.1)
    expect(Math.abs(result.previewTime - result.position)).toBeLessThanOrEqual(.1)
    expect(result.meanPixelDifference).toBeLessThan(12)
  }
  const directory = resolve('../devpost/validation/slice-4')
  mkdirSync(directory, { recursive: true })
  writeFileSync(`${directory}/browser-performance.json`, JSON.stringify({ bytes: job.byte_count, media: job.media, landmarks: results }, null, 2) + '\n')
})
