/// <reference types="./no-result-error.d.ts" />
export class NoResultError extends Error {
  /**
   * The operation node tree of the query that was executed.
   */
  node
  constructor(node) {
    super('no result')
    this.node = node
  }
}
export function isNoResultErrorConstructor(fn) {
  return Object.prototype.hasOwnProperty.call(fn, 'prototype')
}
