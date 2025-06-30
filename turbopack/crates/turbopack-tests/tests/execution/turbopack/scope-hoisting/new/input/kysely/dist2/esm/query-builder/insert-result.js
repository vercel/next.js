/// <reference types="./insert-result.d.ts" />
/**
 * The result of an insert query.
 *
 * If the table has an auto incrementing primary key {@link insertId} will hold
 * the generated id on dialects that support it. For example PostgreSQL doesn't
 * return the id by default and {@link insertId} is undefined. On PostgreSQL you
 * need to use {@link ReturningInterface.returning} or {@link ReturningInterface.returningAll}
 * to get out the inserted id.
 *
 * {@link numInsertedOrUpdatedRows} holds the number of (actually) inserted rows.
 * On MySQL, updated rows are counted twice when using `on duplicate key update`.
 *
 * ### Examples
 *
 * ```ts
 * import type { NewPerson } from 'type-editor' // imaginary module
 *
 * async function insertPerson(person: NewPerson) {
 *   const result = await db
 *     .insertInto('person')
 *     .values(person)
 *     .executeTakeFirstOrThrow()
 *
 *   console.log(result.insertId) // relevant on MySQL
 *   console.log(result.numInsertedOrUpdatedRows) // always relevant
 * }
 * ```
 */
export class InsertResult {
  /**
   * The auto incrementing primary key of the inserted row.
   *
   * This property can be undefined when the query contains an `on conflict`
   * clause that makes the query succeed even when nothing gets inserted.
   *
   * This property is always undefined on dialects like PostgreSQL that
   * don't return the inserted id by default. On those dialects you need
   * to use the {@link ReturningInterface.returning | returning} method.
   */
  insertId
  /**
   * Affected rows count.
   */
  numInsertedOrUpdatedRows
  constructor(insertId, numInsertedOrUpdatedRows) {
    this.insertId = insertId
    this.numInsertedOrUpdatedRows = numInsertedOrUpdatedRows
  }
}
