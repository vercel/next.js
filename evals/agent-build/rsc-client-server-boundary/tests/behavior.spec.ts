import { createHmac } from 'node:crypto'
import { expect, test } from '@playwright/test'

const baseURL = 'http://127.0.0.1:3010'
const signingSecret = 'verifier-team-signing-secret'

test('the server page and client picker keep their behavior', async ({
  page,
}) => {
  await page.goto(baseURL + '/teams')

  await expect(
    page.getByRole('heading', { name: 'Team directory' })
  ).toBeVisible()
  await expect(page.getByText('3 active teams')).toBeVisible()
  await expect(page.getByTestId('selected-team')).toHaveText(
    'Acme uses the enterprise plan.'
  )

  await page.getByRole('combobox', { name: 'Team' }).selectOption('northstar')
  await expect(page.getByTestId('selected-team')).toHaveText(
    'Northstar uses the pro plan.'
  )
})

for (const teamId of ['acme', 'northstar']) {
  test(
    'the server signs ' + teamId + ' without exposing its secret',
    async ({ request }) => {
      const response = await request.get(baseURL + '/api/teams/' + teamId)
      expect(response.ok()).toBe(true)

      const payload = await response.json()
      expect(payload.team.id).toBe(teamId)
      expect(payload.signature).toBe(
        createHmac('sha256', signingSecret).update(teamId).digest('hex')
      )
    }
  )
}

test('unknown teams remain a 404', async ({ request }) => {
  const response = await request.get(baseURL + '/api/teams/unknown')
  expect(response.status()).toBe(404)
})
