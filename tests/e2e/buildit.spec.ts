import { expect, test } from '@playwright/test'

test('loads, edits, and estimates the reference shed', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'BuildIt' })).toBeVisible()
  await expect(page.getByTestId('building-viewport')).toBeVisible()
  await expect(page.getByTestId('design-panel')).toBeVisible()

  const widthInput = page.getByTestId('design-panel').getByRole('spinbutton').first()
  await widthInput.fill('108')
  await expect(page.getByText('W 9′ 0″')).toBeVisible()

  await page.getByRole('button', { name: 'Materials' }).click()
  await expect(page.getByRole('heading', { name: 'Purchase estimate' })).toBeVisible()
  await expect(page.getByText('Metal roofing coverage')).toBeVisible()

  await page.getByRole('button', { name: 'Guidance' }).click()
  await expect(page.getByText('Width is near a sheet boundary')).toBeVisible()
})
