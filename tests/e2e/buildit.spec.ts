import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 1440, height: 900 } })

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

test('dimension handles require a drag and support cancellation', async ({ page }) => {
  await page.goto('/')
  const widthInput = page.getByTestId('design-panel').getByRole('spinbutton').first()

  await page.mouse.move(691, 654)
  await expect(page.getByText('Click and drag')).toBeVisible()
  await page.mouse.move(725, 640)
  await expect(widthInput).toHaveValue('96')

  await page.mouse.move(691, 654)
  await page.mouse.down()
  await page.mouse.move(725, 665, { steps: 5 })
  await expect(widthInput).not.toHaveValue('96')
  await page.keyboard.press('Escape')
  await expect(widthInput).toHaveValue('96')
  await page.mouse.up()

  await page.mouse.move(691, 654)
  await page.mouse.down()
  await page.mouse.move(714, 661, { steps: 4 })
  await page.mouse.up()
  await expect(widthInput).not.toHaveValue('96')
})
