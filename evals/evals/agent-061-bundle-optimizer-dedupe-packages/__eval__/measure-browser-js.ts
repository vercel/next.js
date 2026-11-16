import { expect } from 'playwright/test'
import {
  withProductionBrowser,
  withMeasuredPage,
} from '../../../lib/bundle-optimizer/browser-js.js'

export async function measureBrowserJs() {
  return withProductionBrowser(async (browser, url) => {
    return withMeasuredPage(browser, url, async (page, snapshot) => {
      await expect(
        page.getByRole('heading', { name: 'Deployment Status', level: 1 })
      ).toBeVisible()
      await expect(
        page.getByText('Current status: Ready For Review', { exact: true })
      ).toBeVisible()
      await expect(
        page.getByText('Legacy status: LEGACY PANEL', { exact: true })
      ).toBeVisible()
      return {
        initial: await snapshot(),
        content: { statusLabelsPreserved: true },
      }
    })
  })
}
