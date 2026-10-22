import { test, expect } from '@playwright/test'

test('a delayed old poll cannot replace the next review after reset', async ({ page, request }) => {
  const config = await (await request.get('/api/config')).json()
  if (config.current_job) await request.delete(`/api/jobs/${config.current_job.job_id}`)
  let release!: () => void
  let entered!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const pending = new Promise<void>(resolve => { entered = resolve })
  let held = false
  await page.route('**/api/jobs/*', async route => {
    if (route.request().method() === 'GET' && !held) {
      held = true
      const response = await route.fetch()
      entered()
      await gate
      await route.fulfill({ response })
    } else await route.continue()
  })
  try {
    await page.goto('/')
    await page.getByRole('button', { name: 'Try the demo' }).click()
    await pending
    await page.getByRole('button', { name: 'Cancel analysis' }).click()
    await expect(page.getByRole('button', { name: 'Upload video' })).toBeEnabled()
    await page.locator('input[type=file]').setInputFiles('../samples/normal.mp4')
    await expect(page.getByRole('heading', { name: 'No suspicious intervals detected' })).toBeVisible()
    release()
    await expect(page.getByRole('heading', { name: 'normal.mp4', exact: true })).toBeVisible()
    await expect(page.locator('.finding')).toHaveCount(0)
    await expect(page.locator('.review-progress')).toHaveText('0 of 0 reviewed')
  } finally { release() }
})
