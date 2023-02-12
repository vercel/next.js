describe('example test', function () {

  const homePage = this.page.home();
  const aboutPage = this.page.about();

  after((browser) => browser.quit());

  it('should navigate to the about page', function () {
    // Wait for the element with the text "About Page" and click on it
    homePage.navigate();
    homePage.click('@aboutLink');

    // The new url should be "/about"
    expect.url().to.include(aboutPage.url);

    // The new page should contain a h1 with "About Page"
    aboutPage.assert.textContains('@aboutHeading', 'About Page');
  });

  it('should test the form on the about page', async function () {
    // About page must contain form element
    aboutPage.expect.section('@contactForm').to.be.visible;

    // Get form section
    const formSection = aboutPage.section.contactForm;

    // Form must contain email field
    formSection.expect.element('@email').to.be.visible;

    // Form must contain message field
    formSection.expect.element('@message').to.be.visible;

    // Fill form with test data
    await aboutPage.fillAndSubmitForm();

    // Check the filled-in fields of the form
    await formSection
      .assert.valueEquals('@email', 'test@example.com')
      .assert.textEquals('@message', 'This is a test message.');
  });
});
