import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 1440, height: 900 } })

test('loads, edits, and estimates the reference shed', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'BuildIt' })).toBeVisible()
  await expect(page.getByTestId('building-viewport')).toBeVisible()
  await expect(page.getByTestId('design-panel')).toBeVisible()
  await expect(page.getByRole('button', { name: 'X-ray' })).toHaveClass(/is-active/)

  await page.getByRole('button', { name: 'Sheathing' }).click()
  await expect(page.getByRole('button', { name: 'Sheathing' })).toHaveClass(/is-active/)
  await page.getByRole('button', { name: 'Weather' }).click()
  await expect(page.getByRole('button', { name: 'Weather' })).toHaveClass(/is-active/)
  await page.getByRole('button', { name: 'Finished' }).click()
  await expect(page.getByRole('button', { name: 'Finished' })).toHaveClass(/is-active/)
  await page.getByRole('button', { name: 'Fit view' }).click()

  const widthInput = page.getByTestId('design-panel').getByRole('spinbutton').first()
  await widthInput.fill('108')
  await expect(page.getByText('W 9′ 0″')).toBeVisible()

  await page.getByRole('button', { name: 'Materials' }).click()
  await expect(page.getByRole('heading', { name: 'Purchase estimate' })).toBeVisible()
  await expect(page.getByText('29-gauge 9–36 exposed-fastener roof panel')).toBeVisible()
  await expect(page.getByText('Housewrap water-resistive barrier')).toBeVisible()

  await page.getByRole('button', { name: 'Guidance' }).click()
  await expect(page.getByText('Width is near a sheet boundary')).toBeVisible()
})

test('supports granular model visibility and isolation', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Layers' }).click()

  await expect(page.getByRole('complementary', { name: 'Model visibility' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Preset view' })).toBeVisible()

  await page
    .getByRole('button', {
      name: 'Structural framing: Visible. Change display state.',
    })
    .click()
  await expect(page.getByRole('button', { name: 'Layers · Custom' })).toBeVisible()
  await expect(
    page.getByRole('button', {
      name: 'Structural framing: Ghosted. Change display state.',
    }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Isolate Roof' }).click()
  await expect(page.getByText('Isolation active')).toBeVisible()
  await page.getByRole('button', { name: 'Show context' }).click()
  await expect(page.getByText('Isolation active')).not.toBeVisible()

  await page.getByRole('button', { name: 'Show all' }).click()
  await expect(page.getByRole('button', { name: 'Complete' })).toHaveClass(/is-active/)
})

test('dimension handles require a drag and support cancellation', async ({ page }) => {
  await page.goto('/')
  const widthInput = page.getByTestId('design-panel').getByRole('spinbutton').first()
  await page.getByRole('button', { name: 'Fit view' }).click()
  await page.waitForTimeout(500)
  const widthHandle = page.getByTestId('dimension-handle-widthIn')
  await expect(widthHandle).toBeAttached()
  const moveToWidthHandle = async () => {
    const bounds = await widthHandle.boundingBox()
    if (!bounds) throw new Error('Width handle is outside the rendered viewport')
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    return bounds
  }

  let handleBounds = await moveToWidthHandle()
  await expect(page.getByText('Click and drag')).toBeVisible()
  await page.mouse.move(handleBounds.x + 34, handleBounds.y - 16)
  await expect(widthInput).toHaveValue('96')

  handleBounds = await moveToWidthHandle()
  await page.mouse.down()
  await page.mouse.move(handleBounds.x + 34, handleBounds.y + 9, { steps: 5 })
  await expect(widthInput).not.toHaveValue('96')
  await page.keyboard.press('Escape')
  await expect(widthInput).toHaveValue('96')
  await page.mouse.up()

  handleBounds = await moveToWidthHandle()
  await page.mouse.down()
  await page.mouse.move(handleBounds.x + 23, handleBounds.y + 5, { steps: 4 })
  await page.mouse.up()
  await expect(widthInput).not.toHaveValue('96')
})

test('creates and restores a named section view', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Views' }).click()

  const views = page.getByRole('complementary', { name: 'Views and section cuts' })
  await expect(views).toBeVisible()
  await views.getByRole('button', { name: 'Front', exact: true }).first().click()
  await views.getByRole('checkbox').check()
  await views.getByLabel('Cut depth').fill('24')
  await views.getByLabel('New view name').fill('Front assembly cut')
  await views.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(page.getByText('Front assembly cut')).toBeVisible()
  await expect(page.getByText('xray · front cut')).toBeVisible()

  await views.getByRole('checkbox').uncheck()
  await views.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(views.getByRole('checkbox')).toBeChecked()
  await expect(views.getByLabel('Cut depth')).toHaveValue('24')
})
