describe("Render React Component Post test", function () {
  it("checks the react component", async function (browser) {
    // Mount the Post component
    const postComponent = await browser.mountComponent("/components/Post.jsx", {
      title: "Nightwatch",
    });
    // The Post component must be rendered
    await browser.expect.element(postComponent).to.be.visible;
    // Check the title in h1 (passed in props title)
    browser
      .waitForElementVisible("h1")
      .getText(".post-heading", function (result) {
        this.assert.equal(result.value, "Nightwatch");
      })
      .end();
  });
});
