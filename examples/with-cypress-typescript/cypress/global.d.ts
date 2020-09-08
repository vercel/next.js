/// <reference types="cypress" />

declare namespace Cypress {
  interface Chainable {
    /**
     *  Cypress task for directly querying to the database within tests
     */
    task(
      event: 'filter:database',
      arg: dbQueryArg,
      options?: Partial<Loggable & Timeoutable>
    ): Chainable<any[]>

    /**
     *  Cypress task for directly querying to the database within tests
     */
    task(
      event: 'find:database',
      arg?: any,
      options?: Partial<Loggable & Timeoutable>
    ): Chainable<any>

    /**
     * Find a single entity via api query
     */
    fetchData(
      operation: 'find',
      entity: string,
      query?: object,
      log?: boolean
    ): Chainable<any>

    /**
     * Filter for data entities via api query
     */
    fetchData(
      operation: 'filter',
      entity: string,
      query?: object,
      log?: boolean
    ): Chainable<any[]>
  }
}
