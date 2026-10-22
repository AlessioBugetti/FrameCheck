import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

let directory: string
const evidence = resolve('../devpost/validation/slice-3')
test.beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'framecheck-report-'))
  mkdirSync(evidence, { recursive: true })
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', '../samples/normal.mp4', '-an', '-c:v', 'copy', join(directory, 'normal-no-audio.mp4')])
})
test.afterAll(() => rmSync(directory, { recursive: true, force: true }))
test.beforeEach(async ({ request }) => {
  const config = await (await request.get('/api/config')).json()
  if (config.current_job) await request.delete(`/api/jobs/${config.current_job.job_id}`)
})

async function exportReport(page: Page) {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export report' }).click()
  const download = await pending
  const path = join(directory, download.suggestedFilename())
  await download.saveAs(path)
  return { path, html: readFileSync(path, 'utf8') }
}

async function offlineReport(page: Page, path: string) {
  await page.context().setOffline(true)
  const report = await page.context().newPage()
  await report.goto(pathToFileURL(path).href)
  return report
}

test('report exports all decisions under a filter, hostile filename as text, offline and printable', async ({ page }) => {
  await page.goto('/')
  const name = '<img src=x onerror=alert(1)> & "review".mp4'
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'video/mp4', buffer: readFileSync('../samples/demo.mp4') })
  await expect(page.locator('.interval').first()).toBeEnabled()
  await page.locator('.finding').first().click()
  await page.getByRole('button', { name: 'Mark as intentional' }).click()
  await page.locator('.finding').nth(2).click()
  await page.getByRole('button', { name: 'Mark as problematic' }).click()
  await page.getByLabel('Type', { exact: true }).selectOption('black_frames')
  const source = await (await page.request.get('/api/config')).json()
  const job = await (await page.request.get(`/api/jobs/${source.current_job.job_id}`)).json()
  const { path, html } = await exportReport(page)
  expect(html).not.toMatch(/<script|<img|<link|<video/i)
  const report = await offlineReport(page, path)
  await expect(report.locator('.filename')).toHaveText(name)
  await expect(report.getByText('2 of 4 reviewed · 2 Unreviewed', { exact: true })).toBeVisible()
  const rows = report.locator('table').first().locator('tbody tr')
  await expect(rows).toHaveCount(4)
  await expect(rows.locator('td:last-child')).toHaveText(['Intentional', 'Unreviewed', 'Problematic', 'Unreviewed'])
  for (const [index, finding] of job.findings.entries()) {
    const time = (value: number) => new Date(Math.round(value * 1000)).toISOString().slice(11, 23)
    await expect(rows.nth(index).locator('td').nth(1)).toHaveText(time(finding.start))
    await expect(rows.nth(index).locator('td').nth(2)).toHaveText(time(finding.end))
    await expect(rows.nth(index).locator('td').nth(3)).toHaveText(`${finding.duration.toFixed(3)} s`)
  }
  for (const value of ['Minimum duration (s): 0.5', 'Picture black ratio: 0.98', 'Pixel threshold: 0.1', 'Noise threshold (dB): -60', 'Minimum duration (s): 2', 'Noise threshold (dB): -40', 'Channels: combined']) await expect(report.getByText(value, { exact: false })).toBeVisible()
  expect(await report.evaluate(() => performance.getEntriesByType('resource').length)).toBe(0)
  await report.screenshot({ path: join(evidence, 'report.png'), fullPage: true })
  await report.emulateMedia({ media: 'print' })
  expect(await report.locator('thead').first().evaluate(el => getComputedStyle(el).display)).toBe('table-header-group')
  expect(await report.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await report.pdf({ path: join(evidence, 'report-print.pdf'), preferCSSPageSize: true, printBackground: true })
  await report.close()
})

test('report can export while playback readiness is pending', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/media/original', async route => { await gate; await route.continue() })
  try {
    await page.goto('/')
    await page.getByRole('button', { name: 'Try the demo' }).click()
    await expect(page.getByRole('button', { name: 'Export report' })).toBeEnabled()
    const { html } = await exportReport(page)
    expect(html).toContain('Playback pending: browser frame readiness has not been confirmed.')
    expect(html).toContain('0 of 4 reviewed · 4 Unreviewed')
  } finally { release() }
})

test('server preview failure keeps export, decisions and explicit disclosure', async ({ page }) => {
  await page.route('**/media/original', route => route.abort())
  await page.route('**/api/jobs/*/preview', async route => {
    const response = await page.request.get(route.request().url().replace(/\/preview$/, ''))
    const job = await response.json()
    job.preview = { status: 'failed', progress: null, error: { code: 'preview_failed', message: 'Preview encoding failed in the test.' } }
    await route.fulfill({ status: 202, json: job })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo' }).click()
  await expect(page.getByRole('heading', { name: 'Playback unavailable' })).toBeVisible()
  await expect(page.locator('.interval').first()).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Next unreviewed' })).toBeDisabled()
  const { html } = await exportReport(page)
  expect(html).toContain('Preview preparation failed: Preview encoding failed in the test.')
  expect(html).toContain('0 of 4 reviewed · 4 Unreviewed')
  expect(html).toContain('does not certify that a visual review was completed')
})

test('browser failure after real preview encoding is disclosed without changing decisions', async ({ page }) => {
  await page.route('**/media/original', route => route.abort())
  await page.route('**/media/preview', route => route.abort())
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo' }).click()
  await expect(page.getByRole('heading', { name: 'Playback unavailable' })).toBeVisible()
  const { html } = await exportReport(page)
  expect(html).toContain('The browser could not play this video.')
  expect(html).toContain('0 of 4 reviewed · 4 Unreviewed')
  const report = await offlineReport(page, (await exportReport(page)).path)
  await expect(report.locator('dt').filter({ hasText: /^Preview preparation$/ }).locator('+ dd')).toHaveText('Completed')
  await report.close()
})

test('normal no-audio report states the successful empty outcome', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles(join(directory, 'normal-no-audio.mp4'))
  await expect(page.getByRole('heading', { name: 'No suspicious intervals detected' })).toBeVisible()
  const { path } = await exportReport(page)
  const report = await offlineReport(page, path)
  await expect(report.getByText('No audio track', { exact: true })).toBeVisible()
  await expect(report.getByText('No suspicious intervals detected', { exact: true })).toHaveCount(2)
  await expect(report.getByText('0 of 0 reviewed · 0 Unreviewed', { exact: true })).toBeVisible()
  await expect(report.locator('table')).toHaveCount(1)
  await report.close()
})
