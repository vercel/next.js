/* eslint-env jest */
/* global page, server */

it('should set process.env.NODE_ENV in development', async () => {
  await page.goto(server.getURL('/process-env'))
  await expect(page).toMatchElement('#node-env', {
    text: 'development'
  })
})
