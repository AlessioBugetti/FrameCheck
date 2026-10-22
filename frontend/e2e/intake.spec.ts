import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

let fixtures: string
const evidence = resolve('../devpost/validation/slice-1')

test.beforeAll(() => {
  fixtures = mkdtempSync(join(tmpdir(), 'framecheck-browser-tests-'))
  execFileSync('../.venv/bin/python', ['../scripts/generate_samples.py', '--matrix', '--output', fixtures])
  mkdirSync(evidence, { recursive: true })
  for (const [name, options] of [
    ['offset.mkv', ['-c', 'copy', '-output_ts_offset', '5']],
    ['variable.mkv', ['-vf', "select='gte(t,6)+not(mod(n,2))'", '-fps_mode', 'vfr', '-c:v', 'libx264', '-threads', '4', '-preset', 'veryfast', '-crf', '18', '-c:a', 'copy']],
  ] as const) {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(fixtures, 'demo.mp4'), ...options, join(fixtures, name)])
  }
})

test.afterAll(() => rmSync(fixtures, { recursive: true, force: true }))
test.beforeEach(async ({ request }) => {
  const config = await (await request.get('/api/config')).json()
  if (config.current_job) await request.delete(`/api/jobs/${config.current_job.job_id}`)
})

async function ready(page: Page) {
  await expect(page.getByRole('button', { name: /^Black frames,/ })).toBeEnabled()
  await expect(page.locator('video')).toHaveJSProperty('paused', true)
}

async function frame(page: Page, time: number): Promise<number[]> {
  return page.locator('video').evaluate(async (video: HTMLVideoElement, position) => {
    video.pause()
    await new Promise<void>((done) => {
      video.requestVideoFrameCallback(() => done())
      video.currentTime = position
    })
    const canvas = document.createElement('canvas')
    canvas.width = 64; canvas.height = 36
    const context = canvas.getContext('2d')!
    context.drawImage(video, 0, 0, 64, 36)
    return Array.from(context.getImageData(0, 0, 64, 36).data)
  }, time)
}

function brightness(pixels: number[]) {
  const color = pixels.filter((_, index) => index % 4 !== 3)
  return color.reduce((sum, value) => sum + value, 0) / color.length
}

test('intake demo shows real findings and paused context selection', async ({ page, browser }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Try the demo' })).toBeEnabled()
  await page.screenshot({ path: join(evidence, 'initial.png'), fullPage: true })
  await page.getByRole('button', { name: 'Try the demo' }).click()
  await ready(page)
  await expect(page.locator('.finding')).toHaveCount(4)
  await page.locator('.finding').first().click()
  await expect(page.locator('video')).toHaveJSProperty('currentTime', 1)
  await expect(page.locator('.interval.selected')).toHaveCount(1)
  await expect(page.locator('.finding.selected')).toHaveCount(1)
  expect(brightness(await frame(page, 2.5))).toBeLessThan(3)
  const a = await frame(page, 6.4), b = await frame(page, 7.4)
  expect(a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length).toBeLessThan(1)
  await page.locator('.finding').nth(2).focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeCloseTo(4.96667, 2)
  await expect(page.locator('video')).toHaveJSProperty('paused', true)
  await page.screenshot({ path: join(evidence, 'workspace.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  const player = await page.locator('.player-column').boundingBox()
  const panel = await page.locator('.findings-panel').boundingBox()
  expect(panel!.y).toBeGreaterThan(player!.y + player!.height - 1)
  await page.screenshot({ path: join(evidence, 'narrow.png'), fullPage: true })
  expect(errors).toEqual([])
  test.info().annotations.push({ type: 'browser', description: browser.version() })
})

for (const base of ['demo.mp4', 'h264-aac.mov', 'h264-aac.mkv', 'prores-pcm.mov', 'vp9-opus.webm']) {
  for (const audio of [true, false]) {
    const name = audio ? base : base.replace(/(\.[^.]+)$/, '-no-audio$1')
    test(`playback matrix: ${name}`, async ({ page }) => {
      await page.goto('/')
      await page.locator('input[type=file]').setInputFiles(join(fixtures, name))
      await ready(page)
      await expect(page.locator('.finding')).toHaveCount(audio ? 4 : 3)
      if (!audio) await expect(page.getByText('No audio track', { exact: true })).toBeVisible()
      if (base === 'prores-pcm.mov') await expect(page.getByText('Compatible preview', { exact: true })).toBeVisible()
      expect(brightness(await frame(page, 2.5))).toBeLessThan(3)
      await page.locator('video').evaluate((video: HTMLVideoElement) => video.play())
      await expect(page.locator('video')).toHaveJSProperty('paused', false)
      await page.locator('.finding').last().click()
      await expect(page.locator('video')).toHaveJSProperty('paused', true)
    })
  }
}

for (const name of ['offset.mkv', 'variable.mkv']) {
  test(`playback timestamp landmarks: ${name}`, async ({ page }) => {
    await page.goto('/')
    await page.locator('input[type=file]').setInputFiles(join(fixtures, name))
    await ready(page)
    expect(brightness(await frame(page, 1.9))).toBeGreaterThan(10)
    expect(brightness(await frame(page, 2.1))).toBeLessThan(3)
    expect(brightness(await frame(page, 2.9))).toBeLessThan(3)
    expect(brightness(await frame(page, 3.1))).toBeGreaterThan(10)
    expect(brightness(await frame(page, 11.8))).toBeGreaterThan(10)
  })
}

test('intake normal file and reload reset preserve truthful states', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles(join(fixtures, 'normal.mp4'))
  await expect(page.getByRole('heading', { name: 'No suspicious intervals detected' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Reset current job' })).toBeVisible()
  await page.getByRole('button', { name: 'Reset current job' }).click()
  await expect(page.getByRole('button', { name: 'Try the demo' })).toBeEnabled()
  await page.locator('input[type=file]').setInputFiles({ name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not video') })
  await expect(page.getByRole('heading', { name: 'Analysis could not finish' })).toBeVisible()
  await expect(page.getByText('No suspicious intervals detected')).toHaveCount(0)
})

test('playback fallback failure retains findings and disables timeline', async ({ page }) => {
  await page.route('**/media/original', route => route.abort())
  await page.route('**/media/preview', route => route.abort())
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo' }).click()
  await expect(page.getByRole('heading', { name: 'Playback unavailable' })).toBeVisible()
  await expect(page.locator('.finding')).toHaveCount(4)
  await expect(page.locator('.interval').first()).toBeDisabled()
  await page.locator('.finding').first().click()
  await expect(page.getByText('Selected interval', { exact: true })).toBeVisible()
  await expect(page.locator('.selection-details .status-tag')).toHaveText('Unreviewed')
})

test('playback seeks beyond the initial buffer using real byte ranges', async ({ page }) => {
  let first = true
  let release: () => void = () => {}
  const gate = new Promise<void>(resolve => { release = resolve })
  const ranges: string[] = []
  await page.route('**/media/original', async route => {
    if (first) {
      first = false
      const response = await route.fetch({ headers: { ...route.request().headers(), Range: 'bytes=0-65535' } })
      expect(response.status()).toBe(206)
      await route.fulfill({ response })
    } else {
      ranges.push(route.request().headers().range || '')
      await gate
      await route.continue()
    }
  })
  try {
    await page.goto('/')
    await page.getByRole('button', { name: 'Try the demo' }).click()
    await ready(page)
    const bufferedEnd = await page.locator('video').evaluate((video: HTMLVideoElement) => video.buffered.end(video.buffered.length - 1))
    expect(bufferedEnd).toBeLessThan(8)
    await page.locator('video').evaluate((video: HTMLVideoElement) => { video.currentTime = 11.8 })
    release()
    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2)
    expect(brightness(await frame(page, 11.7))).toBeGreaterThan(10)
    expect(ranges.some(range => /^bytes=\d+-/.test(range))).toBeTruthy()
  } finally {
    release()
  }
})
