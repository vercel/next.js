import { Given, Then } from "cypress-cucumber-preprocessor/steps";

Given('I open the {string} page', (path) => {
  cy.visit(path)
})

When(`I click on the {string} link`, (link) => {
  cy.get(`a[href*="${link}"]`).click()
})

Then(`I see {string} in the url`, (path) => {
  cy.url().should('include', path)
})

Then(`I see {string} in the {string}`, (text, element) => {
  cy.get(element).contains(text)
})
