// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add("login", (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add("drag", { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add("dismiss", { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite("visit", (originalFn, url, options) => { ... })

Cypress.Commands.add(
  'fetchData',
  (operation, entity, query, logTask = false) => {
    const params = {
      entity,
      query,
    }

    const log = Cypress.log({
      name: 'api',
      displayName: 'API',
      message: [`🔎 ${operation}ing within ${entity} data`],
      // @ts-ignore
      autoEnd: false,
      consoleProps() {
        return params
      },
    })

    return cy
      .task(`${operation}:api`, params, { log: logTask })
      .then((data) => {
        log.snapshot()
        log.end()
        return data
      })
  }
)
