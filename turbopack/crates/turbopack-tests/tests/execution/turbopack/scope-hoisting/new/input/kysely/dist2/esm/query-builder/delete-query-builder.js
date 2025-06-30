/// <reference types="./delete-query-builder.d.ts" />
import { parseJoin } from '../parser/join-parser.js'
import { parseTableExpressionOrList } from '../parser/table-parser.js'
import { parseSelectArg, parseSelectAll } from '../parser/select-parser.js'
import { QueryNode } from '../operation-node/query-node.js'
import { freeze } from '../util/object-utils.js'
import { isNoResultErrorConstructor, NoResultError } from './no-result-error.js'
import { DeleteResult } from './delete-result.js'
import { DeleteQueryNode } from '../operation-node/delete-query-node.js'
import { LimitNode } from '../operation-node/limit-node.js'
import { parseOrderBy } from '../parser/order-by-parser.js'
import {
  parseValueBinaryOperationOrExpression,
  parseReferentialBinaryOperation,
} from '../parser/binary-operation-parser.js'
import { parseValueExpression } from '../parser/value-parser.js'
import { parseTop } from '../parser/top-parser.js'
export class DeleteQueryBuilder {
  #props
  constructor(props) {
    this.#props = freeze(props)
  }
  where(...args) {
    return new DeleteQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithWhere(
        this.#props.queryNode,
        parseValueBinaryOperationOrExpression(args)
      ),
    })
  }
  whereRef(lhs, op, rhs) {
    return new DeleteQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithWhere(
        this.#props.queryNode,
        parseReferentialBinaryOperation(lhs, op, rhs)
      ),
    })
  }
  clearWhere() {
    return new DeleteQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithoutWhere(this.#props.queryNode),
    })
  }
  /**
   * Changes a `delete from` query into a `delete top from` query.
   *
   * `top` clause is only supported by some dialects like MS SQL Server.
   *
   * ### Examples
   *
   * Delete the first 5 rows:
   *
   * ```ts
   * await db
   *   .deleteFrom('person')
   *   .top(5)
   *   .where('age', '>', 18)
   *   .executeTakeFirstOrThrow()
   * ```
   *
   * The generated SQL (MS SQL Server):
   *
   * ```sql
   * delete top(5) from "person" where "age" > @1
   * ```
   *
   * Delete the first 50% of rows:
   *
   * ```ts
   * await db
   *   .deleteFrom('person')
   *   .top(50, 'percent')
   *   .where('age', '>', 18)
   *   .executeTakeFirstOrThrow()
   * ```
   *
   * The generated SQL (MS SQL Server):
   *
   * ```sql
   * delete top(50) percent from "person" where "age" > @1
   * ```
   */
  top(expression, modifiers) {
    return new DeleteQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithTop(
        this.#props.queryNode,
        parseTop(expression, modifiers)
      ),
    })
  }
  using(tables) {
    return new DeleteQueryBuilder({
      ...this.#props,
      queryNode: DeleteQueryNode.cloneWithUsing(
        this.#props.queryNode,
        parseTableExpressionOrList(tables)
      ),
    })
  }
  innerJoin(...args) {
    return this.#join('InnerJoin', args)
  }
  leftJoin(...args) {
    return this.#join('LeftJoin', args)
  }
  rightJoin(...args) {
    return this.#join('RightJoin', args)
  }
  fullJoin(...args) {
    return this.#join('FullJoin', args)
  }
  #join(joinType, args) {
    return new DeleteQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithJoin(
        this.#props.queryNode,
        parseJoin(joinType, args)
      ),
    })
  }
  returning(selection) {
    return new DeleteQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithReturning(
        this.#props.queryNode,
        parseSelectArg(selection)
      ),
    })
  }
  returningAll(table) {
    return new DeleteQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithReturning(
        this.#props.queryNode,
        parseSelectAll(table)
      ),
    })
  }
  output(args) {
    return new DeleteQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithOutput(
        this.#props.queryNode,
        parseSelectArg(args)
      ),
    })
  }
  outputAll(table) {
    return new DeleteQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithOutput(
        this.#props.queryNode,
        parseSelectAll(table)
      ),
    })
  }
  /**
   * Clears all `returning` clauses from the query.
   *
   * ### Examples
   *
   * ```ts
   * await db.deleteFrom('pet')
   *   .returningAll()
   *   .where('name', '=', 'Max')
   *   .clearReturning()
   *   .execute()
   * ```
   *
   * The generated SQL(PostgreSQL):
   *
   * ```sql
   * delete from "pet" where "name" = "Max"
   * ```
   */
  clearReturning() {
    return new DeleteQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithoutReturning(this.#props.queryNode),
    })
  }
  /**
   * Clears the `limit` clause from the query.
   *
   * ### Examples
   *
   * ```ts
   * await db.deleteFrom('pet')
   *   .returningAll()
   *   .where('name', '=', 'Max')
   *   .limit(5)
   *   .clearLimit()
   *   .execute()
   * ```
   *
   * The generated SQL(PostgreSQL):
   *
   * ```sql
   * delete from "pet" where "name" = "Max" returning *
   * ```
   */
  clearLimit() {
    return new DeleteQueryBuilder({
      ...this.#props,
      queryNode: DeleteQueryNode.cloneWithoutLimit(this.#props.queryNode),
    })
  }
  orderBy(...args) {
    return new DeleteQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithOrderByItems(
        this.#props.queryNode,
        parseOrderBy(args)
      ),
    })
  }
  clearOrderBy() {
    return new DeleteQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithoutOrderBy(this.#props.queryNode),
    })
  }
  /**
   * Adds a limit clause to the query.
   *
   * A limit clause in a delete query is only supported by some dialects
   * like MySQL.
   *
   * ### Examples
   *
   * Delete 5 oldest items in a table:
   *
   * ```ts
   * await db
   *   .deleteFrom('pet')
   *   .orderBy('created_at')
   *   .limit(5)
   *   .execute()
   * ```
   *
   * The generated SQL (MySQL):
   *
   * ```sql
   * delete from `pet` order by `created_at` limit ?
   * ```
   */
  limit(limit) {
    return new DeleteQueryBuilder({
      ...this.#props,
      queryNode: DeleteQueryNode.cloneWithLimit(
        this.#props.queryNode,
        LimitNode.create(parseValueExpression(limit))
      ),
    })
  }
  /**
   * This can be used to add any additional SQL to the end of the query.
   *
   * ### Examples
   *
   * ```ts
   * import { sql } from 'kysely'
   *
   * await db.deleteFrom('person')
   *   .where('first_name', '=', 'John')
   *   .modifyEnd(sql`-- This is a comment`)
   *   .execute()
   * ```
   *
   * The generated SQL (MySQL):
   *
   * ```sql
   * delete from `person`
   * where `first_name` = "John" -- This is a comment
   * ```
   */
  modifyEnd(modifier) {
    return new DeleteQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithEndModifier(
        this.#props.queryNode,
        modifier.toOperationNode()
      ),
    })
  }
  /**
   * Simply calls the provided function passing `this` as the only argument. `$call` returns
   * what the provided function returns.
   *
   * If you want to conditionally call a method on `this`, see
   * the {@link $if} method.
   *
   * ### Examples
   *
   * The next example uses a helper function `log` to log a query:
   *
   * ```ts
   * import type { Compilable } from 'kysely'
   *
   * function log<T extends Compilable>(qb: T): T {
   *   console.log(qb.compile())
   *   return qb
   * }
   *
   * await db.deleteFrom('person')
   *   .$call(log)
   *   .execute()
   * ```
   */
  $call(func) {
    return func(this)
  }
  /**
   * Call `func(this)` if `condition` is true.
   *
   * This method is especially handy with optional selects. Any `returning` or `returningAll`
   * method calls add columns as optional fields to the output type when called inside
   * the `func` callback. This is because we can't know if those selections were actually
   * made before running the code.
   *
   * You can also call any other methods inside the callback.
   *
   * ### Examples
   *
   * ```ts
   * async function deletePerson(id: number, returnLastName: boolean) {
   *   return await db
   *     .deleteFrom('person')
   *     .where('id', '=', id)
   *     .returning(['id', 'first_name'])
   *     .$if(returnLastName, (qb) => qb.returning('last_name'))
   *     .executeTakeFirstOrThrow()
   * }
   * ```
   *
   * Any selections added inside the `if` callback will be added as optional fields to the
   * output type since we can't know if the selections were actually made before running
   * the code. In the example above the return type of the `deletePerson` function is:
   *
   * ```ts
   * Promise<{
   *   id: number
   *   first_name: string
   *   last_name?: string
   * }>
   * ```
   */
  $if(condition, func) {
    if (condition) {
      return func(this)
    }
    return new DeleteQueryBuilder({
      ...this.#props,
    })
  }
  /**
   * Change the output type of the query.
   *
   * This method call doesn't change the SQL in any way. This methods simply
   * returns a copy of this `DeleteQueryBuilder` with a new output type.
   */
  $castTo() {
    return new DeleteQueryBuilder(this.#props)
  }
  /**
   * Narrows (parts of) the output type of the query.
   *
   * Kysely tries to be as type-safe as possible, but in some cases we have to make
   * compromises for better maintainability and compilation performance. At present,
   * Kysely doesn't narrow the output type of the query when using {@link where} and {@link returning} or {@link returningAll}.
   *
   * This utility method is very useful for these situations, as it removes unncessary
   * runtime assertion/guard code. Its input type is limited to the output type
   * of the query, so you can't add a column that doesn't exist, or change a column's
   * type to something that doesn't exist in its union type.
   *
   * ### Examples
   *
   * Turn this code:
   *
   * ```ts
   * import type { Person } from 'type-editor' // imaginary module
   *
   * const person = await db.deleteFrom('person')
   *   .where('id', '=', 3)
   *   .where('nullable_column', 'is not', null)
   *   .returningAll()
   *   .executeTakeFirstOrThrow()
   *
   * if (isWithNoNullValue(person)) {
   *   functionThatExpectsPersonWithNonNullValue(person)
   * }
   *
   * function isWithNoNullValue(person: Person): person is Person & { nullable_column: string } {
   *   return person.nullable_column != null
   * }
   * ```
   *
   * Into this:
   *
   * ```ts
   * import type { NotNull } from 'kysely'
   *
   * const person = await db.deleteFrom('person')
   *   .where('id', '=', 3)
   *   .where('nullable_column', 'is not', null)
   *   .returningAll()
   *   .$narrowType<{ nullable_column: NotNull }>()
   *   .executeTakeFirstOrThrow()
   *
   * functionThatExpectsPersonWithNonNullValue(person)
   * ```
   */
  $narrowType() {
    return new DeleteQueryBuilder(this.#props)
  }
  /**
   * Asserts that query's output row type equals the given type `T`.
   *
   * This method can be used to simplify excessively complex types to make TypeScript happy
   * and much faster.
   *
   * Kysely uses complex type magic to achieve its type safety. This complexity is sometimes too much
   * for TypeScript and you get errors like this:
   *
   * ```
   * error TS2589: Type instantiation is excessively deep and possibly infinite.
   * ```
   *
   * In these case you can often use this method to help TypeScript a little bit. When you use this
   * method to assert the output type of a query, Kysely can drop the complex output type that
   * consists of multiple nested helper types and replace it with the simple asserted type.
   *
   * Using this method doesn't reduce type safety at all. You have to pass in a type that is
   * structurally equal to the current type.
   *
   * ### Examples
   *
   * ```ts
   * import type { Species } from 'type-editor' // imaginary module
   *
   * async function deletePersonAndPets(personId: number) {
   *   return await db
   *     .with('deleted_person', (qb) => qb
   *        .deleteFrom('person')
   *        .where('id', '=', personId)
   *        .returning('first_name')
   *        .$assertType<{ first_name: string }>()
   *     )
   *     .with('deleted_pets', (qb) => qb
   *       .deleteFrom('pet')
   *       .where('owner_id', '=', personId)
   *       .returning(['name as pet_name', 'species'])
   *       .$assertType<{ pet_name: string, species: Species }>()
   *     )
   *     .selectFrom(['deleted_person', 'deleted_pets'])
   *     .selectAll()
   *     .execute()
   * }
   * ```
   */
  $assertType() {
    return new DeleteQueryBuilder(this.#props)
  }
  /**
   * Returns a copy of this DeleteQueryBuilder instance with the given plugin installed.
   */
  withPlugin(plugin) {
    return new DeleteQueryBuilder({
      ...this.#props,
      executor: this.#props.executor.withPlugin(plugin),
    })
  }
  toOperationNode() {
    return this.#props.executor.transformQuery(
      this.#props.queryNode,
      this.#props.queryId
    )
  }
  compile() {
    return this.#props.executor.compileQuery(
      this.toOperationNode(),
      this.#props.queryId
    )
  }
  /**
   * Executes the query and returns an array of rows.
   *
   * Also see the {@link executeTakeFirst} and {@link executeTakeFirstOrThrow} methods.
   */
  async execute() {
    const compiledQuery = this.compile()
    const result = await this.#props.executor.executeQuery(
      compiledQuery,
      this.#props.queryId
    )
    const { adapter } = this.#props.executor
    const query = compiledQuery.query
    if (
      (query.returning && adapter.supportsReturning) ||
      (query.output && adapter.supportsOutput)
    ) {
      return result.rows
    }
    return [new DeleteResult(result.numAffectedRows ?? BigInt(0))]
  }
  /**
   * Executes the query and returns the first result or undefined if
   * the query returned no result.
   */
  async executeTakeFirst() {
    const [result] = await this.execute()
    return result
  }
  /**
   * Executes the query and returns the first result or throws if
   * the query returned no result.
   *
   * By default an instance of {@link NoResultError} is thrown, but you can
   * provide a custom error class, or callback as the only argument to throw a different
   * error.
   */
  async executeTakeFirstOrThrow(errorConstructor = NoResultError) {
    const result = await this.executeTakeFirst()
    if (result === undefined) {
      const error = isNoResultErrorConstructor(errorConstructor)
        ? new errorConstructor(this.toOperationNode())
        : errorConstructor(this.toOperationNode())
      throw error
    }
    return result
  }
  async *stream(chunkSize = 100) {
    const compiledQuery = this.compile()
    const stream = this.#props.executor.stream(
      compiledQuery,
      chunkSize,
      this.#props.queryId
    )
    for await (const item of stream) {
      yield* item.rows
    }
  }
  async explain(format, options) {
    const builder = new DeleteQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithExplain(
        this.#props.queryNode,
        format,
        options
      ),
    })
    return await builder.execute()
  }
}
