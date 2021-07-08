describe("formValidation", () => {
  it("should be able to show a greeting", () => {
    cy.visit("http://localhost:3000");
    cy.dataAutomation("Index.Greeting");
  });
});
