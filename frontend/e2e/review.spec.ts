import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

test.beforeEach(async ({ page, request }) => {
  const config = await (await request.get('/api/config')).json()
  if (config.current_job) await request.delete(`/api/jobs/${config.current_job.job_id}`)
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo' }).click()
  await expect(page.locator('.interval').first()).toBeEnabled()
})

test('review decisions preserve position, filters and explicit continuation', async ({ page }) => {
  const video = page.locator('video')
  await page.getByLabel('Review status', { exact: true }).selectOption('unreviewed')
  await page.locator('.finding').first().click()
  await expect(video).toHaveJSProperty('currentTime', 1)
  await video.evaluate(async (v: HTMLVideoElement) => { v.currentTime = 2.4; await v.play() })
  await page.getByRole('button', { name: 'Mark as intentional' }).click()
  await expect(video).toHaveJSProperty('paused', true)
  const preserved = await video.evaluate((v: HTMLVideoElement) => v.currentTime)
  expect(preserved).toBeGreaterThanOrEqual(2.4)
  await expect(page.locator('.finding')).toHaveCount(3)
  await expect(page.locator('.selected')).toHaveCount(0)
  await expect(page.locator('.review-progress')).toHaveText('1 of 4 reviewed')
  await expect(page.getByRole('button', { name: 'Next unreviewed' })).toBeFocused()
  await expect(video).toHaveJSProperty('currentTime', preserved)
  await page.keyboard.press('Enter')
  await expect(page.locator('.selection-details h3')).toHaveText('Frozen frames')
  await expect(video).toHaveJSProperty('currentTime', 1)
  await page.getByLabel('Type', { exact: true }).selectOption('silence')
  await page.getByRole('button', { name: 'Next unreviewed' }).click()
  await expect(page.locator('.selection-details h3')).toHaveText('Silence')
  await page.getByRole('button', { name: 'Mark as problematic' }).click()
  await expect(page.getByText('No findings match these filters')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next unreviewed' })).toBeDisabled()
  await expect(page.getByLabel('Review status', { exact: true })).toBeFocused()
  await page.getByLabel('Review status', { exact: true }).selectOption('problematic')
  await page.locator('.finding').click()
  await page.getByRole('button', { name: 'Restore to unreviewed' }).click()
  await expect(page.locator('.review-progress')).toHaveText('1 of 4 reviewed')
  await page.getByLabel('Review status', { exact: true }).selectOption('all')
  await page.getByLabel('Type', { exact: true }).selectOption('all')
  await page.locator('.finding').last().click()
  await page.getByRole('button', { name: 'Next unreviewed' }).click()
  await expect(page.locator('.selection-details h3')).toHaveText('Frozen frames')
  await expect(video).toHaveJSProperty('currentTime', 1)
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: 'New video' }).click()
  await expect(page.locator('.review-progress')).toHaveText('1 of 4 reviewed')
})

test('keyboard review stays selected without filters and can restore all decisions', async ({ page }) => {
  await page.locator('.finding').first().focus()
  await page.keyboard.press('Enter')
  const actions = ['Mark as intentional', 'Mark as problematic', 'Restore to unreviewed']
  for (const [index, name] of actions.entries()) {
    const button = page.getByRole('button', { name })
    await button.focus()
    expect(await button.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none')
    await page.keyboard.press('Enter')
    await expect(page.locator('.finding.selected')).toHaveCount(1)
    await expect(page.locator('video')).toHaveJSProperty('currentTime', 1)
    await expect(page.locator('.review-progress')).toHaveText(`${index === 2 ? 0 : 1} of 4 reviewed`)
  }
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Mark as intentional' }).focus()
    await page.keyboard.press('Enter')
    if (i < 3) {
      await page.getByRole('button', { name: 'Next unreviewed' }).focus()
      await page.keyboard.press('Enter')
    }
  }
  await expect(page.locator('.review-progress')).toHaveText('4 of 4 reviewed')
  await expect(page.getByRole('button', { name: 'Next unreviewed' })).toBeDisabled()
  const dir = resolve('../devpost/validation/slice-2')
  mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: `${dir}/workspace.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.screenshot({ path: `${dir}/narrow.png`, fullPage: true })
})
