import { User } from '../../interfaces'

describe('App', function () {
  beforeEach(function () {
    cy.visit('/')
  })

  it('displays header on home page', function () {
    cy.get('h1').should('contain', 'Hello Next.js')
  })

  it('renders top navigation', function () {
    cy.get('[data-test*=nav-]').should('have.length', 4)
  })

  it('navigates to the about page', function () {
    cy.get('[data-test=nav-about]').click()
    cy.location('pathname').should('eq', '/about')
  })

  it('displays a list of users', function () {
    cy.get('[data-test=nav-users-list]').click()
    cy.location('pathname').should('eq', '/users')

    cy.fetchData('filter', 'users').then((users: User[]) => {
      users.forEach((user: User) => {
        cy.get('users-list').contains(user.name)
      })
    })
  })

  it('performs and API test for users', function () {
    cy.request(`${Cypress.env('apiUrl')}/users`).then((response) => {
      expect(response.body).to.have.lengthOf(4)
    })
  })
})
