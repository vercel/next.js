const randomString = () => (Math.random() + 1).toString(36).substring(7)
const randomPassword = () => randomString() + randomString()
const randomEmail = () => randomString() + '@' + randomString() + '.com'

const login = (email, password) => {
  cy.visit('/api/.ory/ui/login')
  cy.get('[name="password_identifier"]').type(email)
  cy.get('[name="password"]').type(password)
  cy.get('[name="method"]').click()
  loggedIn(email)
}

const loggedIn = (email) => {
  cy.location('pathname').should('eq', '/')
  cy.get('[data-testid="session-content"]').should('contain.text', email)
  cy.get('[data-testid="logout"]').should('have.attr', 'aria-disabled', 'false')
}

context('Basic UI interactions', () => {
  const email = randomEmail()
  const password = randomPassword()

  beforeEach(() => {
    cy.clearCookies({ domain: null })
  })

  it('can load the start page', () => {
    cy.visit('/')
    cy.get('a[href="/api/.ory/self-service/login/browser"]').should('exist')
    cy.get('a[href="/api/.ory/self-service/registration/browser"]').should(
      'exist'
    )
  })

  it('redirects to login when accessing settings without session', () => {
    cy.visit('/api/.ory/ui/settings')
    cy.location('pathname').should('contain', 'api/.ory/ui/login')
    cy.get('[name="method"]').should('exist')
  })

  it('can submit registration', () => {
    cy.visit('/api/.ory/ui/registration')
    cy.get('[name="traits.email"]').type(email)
    cy.get('[name="password"]').type(password)
    cy.get('[name="method"]').click()
    loggedIn(email)
  })

  it('can load the login page', () => {
    login(email, password)
  })

  it('goes to registration and clicks on log in and redirect works', () => {
    cy.visit('/api/.ory/ui/registration')
    cy.get('[data-testid="cta-link"]').click()
    login(email, password)
  })

  it('can log out', () => {
    login(email, password)
    cy.get('a[data-testid="logout"]').click()
    cy.get('[data-testid="logout"]').should('not.exist')
  })
})
