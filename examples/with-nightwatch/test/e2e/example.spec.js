describe("example test", function () {
  // Get Home Page Object
  const homePage = browser.page.home();
  // Get About Page Object
  const aboutPage = browser.page.about();

  // Start from the index page (the launch_url is set via the test_settings in the nightwatch.config.js)
  before(async () => homePage.navigate());
  // Ends the session and closes down the test WebDriver server
  after(async (browser) => browser.quit());

  it("should navigate to the about page", async function () {
    // Call custom command sayHello
    browser.sayHelloTest(1);

    // Wait for the element with the text "About Page" and click on it
    homePage.waitForElementVisible("@aboutLink").click("@aboutLink");
    // Wait until the URL changes to "/about"
    browser.waitUntil(
      async () => (await browser.getCurrentUrl()) === aboutPage.url()
    );
    // The new url should be "/about"
    expect(browser.getCurrentUrl()).to.equal(aboutPage.url());

    // The new page should contain an h1 with "About Page"
    aboutPage
      .waitForElementVisible("@aboutHeading")
      .assert.textContains("@aboutHeading", "About Page");
  });

  it("should test the form on the about page", async function () {
    // Call custom command sayHello
    browser.sayHelloTest(2);

    // About page must contain form element
    await aboutPage.expect.section("@contactForm").to.be.visible;
    // Get form section
    const formSection = aboutPage.section.contactForm;
    // Form must contain email field
    await formSection.expect.element("@email").to.be.visible;
    // Form must contain message field
    await formSection.expect.element("@message").to.be.visible;
    // Fill form with test data
    await aboutPage.fillAndSubmitForm();
    // Check the filled-in fields of the form
    await formSection
      .assert.valueEquals("@email", "test@example.com")
      .assert.textContains("@message", "This is a test message.");
  });
});
