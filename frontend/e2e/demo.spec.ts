import { test, expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

async function activateWithKeyboard(page: Page, target: Locator) {
  for (let tabs = 0; tabs < 60; tabs++) {
    if (await target.evaluate(el => el === document.activeElement)) {
      expect(await target.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none')
      await page.keyboard.press('Enter')
      return
    }
    await page.keyboard.press('Tab')
  }
  throw new Error('The demo control was not reachable using Tab')
}

test('the full demo can be completed using Tab and Enter', async ({ page, request }) => {
  const config = await (await request.get('/api/config')).json()
  if (config.current_job) await request.delete(`/api/jobs/${config.current_job.job_id}`)
  await page.goto('/')
  const started = Date.now()
  await activateWithKeyboard(page, page.getByRole('button', { name: 'Try the demo' }))
  await expect(page.locator('.interval').first()).toBeEnabled()
  const review = [
    { index: 0, action: 'Mark as intentional', context: 1 },
    { index: 1, action: 'Mark as intentional', context: 1 },
    { index: 2, action: 'Mark as problematic', context: 4.96667 },
    { index: 3, action: 'Mark as intentional', context: 8.003 },
  ]
  for (const finding of review) {
    await activateWithKeyboard(page, page.locator('.finding').nth(finding.index))
    await expect(page.locator('video')).toHaveJSProperty('paused', true)
    expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(finding.context, 2)
    await activateWithKeyboard(page, page.getByRole('button', { name: finding.action }))
  }
  await expect(page.locator('.review-progress')).toHaveText('4 of 4 reviewed')
  const download = page.waitForEvent('download')
  await activateWithKeyboard(page, page.getByRole('button', { name: 'Export report' }))
  expect((await download).suggestedFilename()).toContain('framecheck-report.html')
  const directory = resolve('../devpost/validation/slice-4')
  mkdirSync(directory, { recursive: true })
  writeFileSync(`${directory}/demo-rehearsal.json`, JSON.stringify({ keyboardOnly: true, issueTypesReviewed: ['Black frames', 'Frozen frames', 'Silence'], reviewed: 4, total: 4, exportCompleted: true, automatedSeconds: (Date.now() - started) / 1000, note: 'Automated interaction evidence; the learner records their own narrated 1–3 minute demo.' }, null, 2) + '\n')
  await page.screenshot({ path: `${directory}/demo-complete.png`, fullPage: true })
})
