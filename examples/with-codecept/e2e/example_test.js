/* global Feature, Scenario */
Feature('CodeceptJS Next.js Example')

Scenario('should navigate to the about page', ({ I }) => {
  // Start from the index page (the baseURL is set via the webServer in the codecept.conf.js)
  I.amOnPage('/')
  // Find an element with the text 'About Page' and click on it
  I.click('About Page')
  // The new url should be "/about" (baseURL is used there)
  I.amOnPage('/about')
  // The new page should contain an h1 with "About Page"
  I.see('About Page', 'h1')
})
