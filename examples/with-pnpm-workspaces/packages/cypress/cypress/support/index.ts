/// <reference types="cypress" />
import "./commands";

declare global {
  namespace Cypress {
    interface Chainable {
      dataAutomation(value: string): Chainable;
    }
  }
}
