/// <reference types="./update-query-builder.d.ts" />
import { parseJoin } from '../parser/join-parser.js'
import { parseTableExpressionOrList } from '../parser/table-parser.js'
import { parseSelectArg, parseSelectAll } from '../parser/select-parser.js'
import { QueryNode } from '../operation-node/query-node.js'
import { UpdateQueryNode } from '../operation-node/update-query-node.js'
import { parseUpdate } from '../parser/update-set-parser.js'
import { freeze } from '../util/object-utils.js'
import { UpdateResult } from './update-result.js'
import { isNoResultErrorConstructor, NoResultError } from './no-result-error.js'
import {
  parseReferentialBinaryOperation,
  parseValueBinaryOperationOrExpression,
} from '../parser/binary-operation-parser.js'
import { parseValueExpression } from '../parser/value-parser.js'
import { LimitNode } from '../operation-node/limit-node.js'
import { parseTop } from '../parser/top-parser.js'
import { parseOrderBy } from '../parser/order-by-parser.js'
export class UpdateQueryBuilder {
  #props
  constructor(props) {
    this.#props = freeze(props)
  }
  where(...args) {
    return new UpdateQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithWhere(
        this.#props.queryNode,
        parseValueBinaryOperationOrExpression(args)
      ),
    })
  }
  whereRef(lhs, op, rhs) {
    return new UpdateQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithWhere(
        this.#props.queryNode,
        parseReferentialBinaryOperation(lhs, op, rhs)
      ),
    })
  }
  clearWhere() {
    return new UpdateQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithoutWhere(this.#props.queryNode),
    })
  }
  /**
   * Changes an `update` query into a `update top` query.
   *
   * `top` clause is only supported by some dialects like MS SQL Server.
   *
   * ### Examples
   *
   * Update the first row:
   *
   * ```ts
   * await db.updateTable('person')
   *   .top(1)
   *   .set({ first_name: 'Foo' })
   *   .where('age', '>', 18)
   *   .executeTakeFirstOrThrow()
   * ```
   *
   * The generated SQL (MS SQL Server):
   *
   * ```sql
   * update top(1) "person" set "first_name" = @1 where "age" > @2
   * ```
   *
   * Update the 50% first rows:
   *
   * ```ts
   * await db.updateTable('person')
   *   .top(50, 'percent')
   *   .set({ first_name: 'Foo' })
   *   .where('age', '>', 18)
   *   .executeTakeFirstOrThrow()
   * ```
   *
   * The generated SQL (MS SQL Server):
   *
   * ```sql
   * update top(50) percent "person" set "first_name" = @1 where "age" > @2
   * ```
   */
  top(expression, modifiers) {
    return new UpdateQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithTop(
        this.#props.queryNode,
        parseTop(expression, modifiers)
      ),
    })
  }
  from(from) {
    return new UpdateQueryBuilder({
      ...this.#props,
      queryNode: UpdateQueryNode.cloneWithFromItems(
        this.#props.queryNode,
        parseTableExpressionOrList(from)
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
    return new UpdateQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithJoin(
        this.#props.queryNode,
        parseJoin(joinType, args)
      ),
    })
  }
  orderBy(...args) {
    return new UpdateQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithOrderByItems(
        this.#props.queryNode,
        parseOrderBy(args)
      ),
    })
  }
  clearOrderBy() {
    return new UpdateQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithoutOrderBy(this.#props.queryNode),
    })
  }
  /**
   * Adds a limit clause to the update query for supported databases, such as MySQL.
   *
   * ### Examples
   *
   * Update the first 2 rows in the 'person' table:
   *
   * ```ts
   * await db
   *   .updateTable('person')
   *   .set({ first_name: 'Foo' })
   *   .limit(2)
   *   .execute()
   * ```
   *
   * The generated SQL (MySQL):
   *
   * ```sql
   * update `person` set `first_name` = ? limit ?
   * ```
   */
  limit(limit) {
    return new UpdateQueryBuilder({
      ...this.#props,
      queryNode: UpdateQueryNode.cloneWithLimit(
        this.#props.queryNode,
        LimitNode.create(parseValueExpression(limit))
      ),
    })
  }
  set(...args) {
    return new UpdateQueryBuilder({
      ...this.#props,
      queryNode: UpdateQueryNode.cloneWithUpdates(
        this.#props.queryNode,
        parseUpdate(...args)
      ),
    })
  }
  returning(selection) {
    return new UpdateQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithReturning(
        this.#props.queryNode,
        parseSelectArg(selection)
      ),
    })
  }
  returningAll(table) {
    return new UpdateQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithReturning(
        this.#props.queryNode,
        parseSelectAll(table)
      ),
    })
  }
  output(args) {
    return new UpdateQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithOutput(
        this.#props.queryNode,
        parseSelectArg(args)
      ),
    })
  }
  outputAll(table) {
    return new UpdateQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithOutput(
        this.#props.queryNode,
        parseSelectAll(table)
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
   * await db.updateTable('person')
   *   .set({ age: 39 })
   *   .where('first_name', '=', 'John')
   *   .modifyEnd(sql.raw('-- This is a comment'))
   *   .execute()
   * ```
   *
   * The generated SQL (MySQL):
   *
   * ```sql
   * update `person`
   * set `age` = 39
   * where `first_name` = "John" -- This is a comment
   * ```
   */
  modifyEnd(modifier) {
    return new UpdateQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithEndModifier(
        this.#props.queryNode,
        modifier.toOperationNode()
      ),
    })
  }
  /**
   * Clears all `returning` clauses from the query.
   *
   * ### Examples
   *
   * ```ts
   * db.updateTable('person')
   *   .returningAll()
   *   .set({ age: 39 })
   *   .where('first_name', '=', 'John')
   *   .clearReturning()
   * ```
   *
   * The generated SQL(PostgreSQL):
   *
   * ```sql
   * update "person" set "age" = 39 where "first_name" = "John"
   * ```
   */
  clearReturning() {
    return new UpdateQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithoutReturning(this.#props.queryNode),
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
   * import type { PersonUpdate } from 'type-editor' // imaginary module
   *
   * function log<T extends Compilable>(qb: T): T {
   *   console.log(qb.compile())
   *   return qb
   * }
   *
   * const values = {
   *   first_name: 'John',
   * } satisfies PersonUpdate
   *
   * db.updateTable('person')
   *   .set(values)
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
   * import type { PersonUpdate } from 'type-editor' // imaginary module
   *
   * async function updatePerson(id: number, updates: PersonUpdate, returnLastName: boolean) {
   *   return await db
   *     .updateTable('person')
   *     .set(updates)
   *     .where('id', '=', id)
   *     .returning(['id', 'first_name'])
   *     .$if(returnLastName, (qb) => qb.returning('last_name'))
   *     .executeTakeFirstOrThrow()
   * }
   * ```
   *
   * Any selections added inside the `if` callback will be added as optional fields to the
   * output type since we can't know if the selections were actually made before running
   * the code. In the example above the return type of the `updatePerson` function is:
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
    return new UpdateQueryBuilder({
      ...this.#props,
    })
  }
  /**
   * Change the output type of the query.
   *
   * This method call doesn't change the SQL in any way. This methods simply
   * returns a copy of this `UpdateQueryBuilder` with a new output type.
   */
  $castTo() {
    return new UpdateQueryBuilder(this.#props)
  }
  /**
   * Narrows (parts of) the output type of the query.
   *
   * Kysely tries to be as type-safe as possible, but in some cases we have to make
   * compromises for better maintainability and compilation performance. At present,
   * Kysely doesn't narrow the output type of the query based on {@link set} input
   * when using {@link where} and/or {@link returning} or {@link returningAll}.
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
   * const id = 1
   * const now = new Date().toISOString()
   *
   * const person = await db.updateTable('person')
   *   .set({ deleted_at: now })
   *   .where('id', '=', id)
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
   * const id = 1
   * const now = new Date().toISOString()
   *
   * const person = await db.updateTable('person')
   *   .set({ deleted_at: now })
   *   .where('id', '=', id)
   *   .where('nullable_column', 'is not', null)
   *   .returningAll()
   *   .$narrowType<{ deleted_at: Date; nullable_column: NotNull }>()
   *   .executeTakeFirstOrThrow()
   *
   * functionThatExpectsPersonWithNonNullValue(person)
   * ```
   */
  $narrowType() {
    return new UpdateQueryBuilder(this.#props)
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
   * import type { PersonUpdate, PetUpdate, Species } from 'type-editor' // imaginary module
   *
   * const person = {
   *   id: 1,
   *   gender: 'other',
   * } satisfies PersonUpdate
   *
   * const pet = {
   *   name: 'Fluffy',
   * } satisfies PetUpdate
   *
   * const result = await db
   *   .with('updated_person', (qb) => qb
   *     .updateTable('person')
   *     .set(person)
   *     .where('id', '=', person.id)
   *     .returning('first_name')
   *     .$assertType<{ first_name: string }>()
   *   )
   *   .with('updated_pet', (qb) => qb
   *     .updateTable('pet')
   *     .set(pet)
   *     .where('owner_id', '=', person.id)
   *     .returning(['name as pet_name', 'species'])
   *     .$assertType<{ pet_name: string, species: Species }>()
   *   )
   *   .selectFrom(['updated_person', 'updated_pet'])
   *   .selectAll()
   *   .executeTakeFirstOrThrow()
   * ```
   */
  $assertType() {
    return new UpdateQueryBuilder(this.#props)
  }
  /**
   * Returns a copy of this UpdateQueryBuilder instance with the given plugin installed.
   */
  withPlugin(plugin) {
    return new UpdateQueryBuilder({
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
    return [
      new UpdateResult(
        result.numAffectedRows ?? BigInt(0),
        result.numChangedRows
      ),
    ]
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
    const builder = new UpdateQueryBuilder({
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
