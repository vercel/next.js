Cypress.Commands.add("dataAutomation", (value) => {
  return cy.get(`[data-automation='${value}']`);
});
