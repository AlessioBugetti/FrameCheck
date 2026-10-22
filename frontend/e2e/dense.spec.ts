import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

let directory: string
const evidence = resolve('../devpost/validation/slice-4')
test.beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'framecheck-dense-'))
  mkdirSync(evidence, { recursive: true })
  execFileSync('.venv/bin/python', ['-c', 'import sys; from scripts.generate_samples import generate_dense; generate_dense(sys.argv[1])', directory], { cwd: resolve('..') })
})
test.afterAll(() => rmSync(directory, { recursive: true, force: true }))

test('dense findings retain real intervals, precise keyboard selection and readable layout', async ({ page, request }) => {
  const config = await (await request.get('/api/config')).json()
  if (config.current_job) await request.delete(`/api/jobs/${config.current_job.job_id}`)
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles(join(directory, 'dense.mp4'))
  await expect(page.locator('.interval').first()).toBeEnabled()
  await expect(page.locator('.finding')).toHaveCount(57)
  await expect(page.locator('.timeline-row').nth(0).locator('.interval')).toHaveCount(30)
  await expect(page.locator('.timeline-row').nth(1).locator('.interval')).toHaveCount(15)
  await expect(page.locator('.timeline-row').nth(2).locator('.interval')).toHaveCount(12)
  const first = page.locator('.timeline-row').first().locator('.interval').first()
  const interval = await first.boundingBox()
  const track = await page.locator('.track').first().boundingBox()
  expect(interval!.width / track!.width).toBeCloseTo(0.6 / 120, 3)
  expect(await first.evaluate(el => parseFloat(getComputedStyle(el, '::before').width))).toBeGreaterThanOrEqual(28)
  await page.locator('.finding').last().focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.finding.selected')).toHaveCount(1)
  await expect(page.locator('.interval.selected')).toHaveCount(1)
  expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(115)
  await expect(page.locator('video')).toHaveJSProperty('paused', true)
  await page.getByRole('button', { name: 'Mark as problematic' }).click()
  await page.locator('.finding').first().click()
  await page.getByRole('button', { name: 'Mark as intentional' }).click()
  await page.locator('.finding').nth(1).click()
  await page.getByRole('button', { name: 'Next unreviewed' }).click()
  const selectedBounds = await page.locator('.finding.selected').boundingBox()
  const listBounds = await page.locator('.findings-list').boundingBox()
  expect(selectedBounds!.y).toBeGreaterThanOrEqual(listBounds!.y)
  expect(selectedBounds!.y + selectedBounds!.height).toBeLessThanOrEqual(listBounds!.y + listBounds!.height)
  const contrasts = await page.locator('.status-tag, .track-label, .finding-time, .review-progress').evaluateAll(elements => {
    const luminance = (rgb: number[]) => rgb.slice(0, 3).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0)
    return elements.map(element => {
      const foreground = getComputedStyle(element).color.match(/[\d.]+/g)!.map(Number)
      let parent: Element | null = element
      let background: number[] = []
      while (parent) {
        background = getComputedStyle(parent).backgroundColor.match(/[\d.]+/g)!.map(Number)
        if (background.length === 3 || background[3] !== 0) break
        parent = parent.parentElement
      }
      const a = luminance(foreground), b = luminance(background)
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
    })
  })
  expect(Math.min(...contrasts)).toBeGreaterThanOrEqual(4.5)
  await page.screenshot({ path: join(evidence, 'dense-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.locator('.finding').last().focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.selection-details .status-tag')).toHaveText('Problematic')
  await page.screenshot({ path: join(evidence, 'dense-narrow.png'), fullPage: true })
})
