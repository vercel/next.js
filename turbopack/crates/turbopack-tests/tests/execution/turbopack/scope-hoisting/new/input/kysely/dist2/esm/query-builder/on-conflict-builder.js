/// <reference types="./on-conflict-builder.d.ts" />
import { ColumnNode } from '../operation-node/column-node.js'
import { IdentifierNode } from '../operation-node/identifier-node.js'
import { OnConflictNode } from '../operation-node/on-conflict-node.js'
import {
  parseValueBinaryOperationOrExpression,
  parseReferentialBinaryOperation,
} from '../parser/binary-operation-parser.js'
import { parseUpdateObjectExpression } from '../parser/update-set-parser.js'
import { freeze } from '../util/object-utils.js'
export class OnConflictBuilder {
  #props
  constructor(props) {
    this.#props = freeze(props)
  }
  /**
   * Specify a single column as the conflict target.
   *
   * Also see the {@link columns}, {@link constraint} and {@link expression}
   * methods for alternative ways to specify the conflict target.
   */
  column(column) {
    const columnNode = ColumnNode.create(column)
    return new OnConflictBuilder({
      ...this.#props,
      onConflictNode: OnConflictNode.cloneWith(this.#props.onConflictNode, {
        columns: this.#props.onConflictNode.columns
          ? freeze([...this.#props.onConflictNode.columns, columnNode])
          : freeze([columnNode]),
      }),
    })
  }
  /**
   * Specify a list of columns as the conflict target.
   *
   * Also see the {@link column}, {@link constraint} and {@link expression}
   * methods for alternative ways to specify the conflict target.
   */
  columns(columns) {
    const columnNodes = columns.map(ColumnNode.create)
    return new OnConflictBuilder({
      ...this.#props,
      onConflictNode: OnConflictNode.cloneWith(this.#props.onConflictNode, {
        columns: this.#props.onConflictNode.columns
          ? freeze([...this.#props.onConflictNode.columns, ...columnNodes])
          : freeze(columnNodes),
      }),
    })
  }
  /**
   * Specify a specific constraint by name as the conflict target.
   *
   * Also see the {@link column}, {@link columns} and {@link expression}
   * methods for alternative ways to specify the conflict target.
   */
  constraint(constraintName) {
    return new OnConflictBuilder({
      ...this.#props,
      onConflictNode: OnConflictNode.cloneWith(this.#props.onConflictNode, {
        constraint: IdentifierNode.create(constraintName),
      }),
    })
  }
  /**
   * Specify an expression as the conflict target.
   *
   * This can be used if the unique index is an expression index.
   *
   * Also see the {@link column}, {@link columns} and {@link constraint}
   * methods for alternative ways to specify the conflict target.
   */
  expression(expression) {
    return new OnConflictBuilder({
      ...this.#props,
      onConflictNode: OnConflictNode.cloneWith(this.#props.onConflictNode, {
        indexExpression: expression.toOperationNode(),
      }),
    })
  }
  where(...args) {
    return new OnConflictBuilder({
      ...this.#props,
      onConflictNode: OnConflictNode.cloneWithIndexWhere(
        this.#props.onConflictNode,
        parseValueBinaryOperationOrExpression(args)
      ),
    })
  }
  whereRef(lhs, op, rhs) {
    return new OnConflictBuilder({
      ...this.#props,
      onConflictNode: OnConflictNode.cloneWithIndexWhere(
        this.#props.onConflictNode,
        parseReferentialBinaryOperation(lhs, op, rhs)
      ),
    })
  }
  clearWhere() {
    return new OnConflictBuilder({
      ...this.#props,
      onConflictNode: OnConflictNode.cloneWithoutIndexWhere(
        this.#props.onConflictNode
      ),
    })
  }
  /**
   * Adds the "do nothing" conflict action.
   *
   * ### Examples
   *
   * ```ts
   * const id = 1
   * const first_name = 'John'
   *
   * await db
   *   .insertInto('person')
   *   .values({ first_name, id })
   *   .onConflict((oc) => oc
   *     .column('id')
   *     .doNothing()
   *   )
   *   .execute()
   * ```
   *
   * The generated SQL (PostgreSQL):
   *
   * ```sql
   * insert into "person" ("first_name", "id")
   * values ($1, $2)
   * on conflict ("id") do nothing
   * ```
   */
  doNothing() {
    return new OnConflictDoNothingBuilder({
      ...this.#props,
      onConflictNode: OnConflictNode.cloneWith(this.#props.onConflictNode, {
        doNothing: true,
      }),
    })
  }
  /**
   * Adds the "do update set" conflict action.
   *
   * ### Examples
   *
   * ```ts
   * const id = 1
   * const first_name = 'John'
   *
   * await db
   *   .insertInto('person')
   *   .values({ first_name, id })
   *   .onConflict((oc) => oc
   *     .column('id')
   *     .doUpdateSet({ first_name })
   *   )
   *   .execute()
   * ```
   *
   * The generated SQL (PostgreSQL):
   *
   * ```sql
   * insert into "person" ("first_name", "id")
   * values ($1, $2)
   * on conflict ("id")
   * do update set "first_name" = $3
   * ```
   *
   * In the next example we use the `ref` method to reference
   * columns of the virtual table `excluded` in a type-safe way
   * to create an upsert operation:
   *
   * ```ts
   * import type { NewPerson } from 'type-editor' // imaginary module
   *
   * async function upsertPerson(person: NewPerson): Promise<void> {
   *   await db.insertInto('person')
   *     .values(person)
   *     .onConflict((oc) => oc
   *       .column('id')
   *       .doUpdateSet((eb) => ({
   *         first_name: eb.ref('excluded.first_name'),
   *         last_name: eb.ref('excluded.last_name')
   *       })
   *     )
   *   )
   *   .execute()
   * }
   * ```
   *
   * The generated SQL (PostgreSQL):
   *
   * ```sql
   * insert into "person" ("first_name", "last_name")
   * values ($1, $2)
   * on conflict ("id")
   * do update set
   *  "first_name" = excluded."first_name",
   *  "last_name" = excluded."last_name"
   * ```
   */
  doUpdateSet(update) {
    return new OnConflictUpdateBuilder({
      ...this.#props,
      onConflictNode: OnConflictNode.cloneWith(this.#props.onConflictNode, {
        updates: parseUpdateObjectExpression(update),
      }),
    })
  }
  /**
   * Simply calls the provided function passing `this` as the only argument. `$call` returns
   * what the provided function returns.
   */
  $call(func) {
    return func(this)
  }
}
export class OnConflictDoNothingBuilder {
  #props
  constructor(props) {
    this.#props = freeze(props)
  }
  toOperationNode() {
    return this.#props.onConflictNode
  }
}
export class OnConflictUpdateBuilder {
  #props
  constructor(props) {
    this.#props = freeze(props)
  }
  where(...args) {
    return new OnConflictUpdateBuilder({
      ...this.#props,
      onConflictNode: OnConflictNode.cloneWithUpdateWhere(
        this.#props.onConflictNode,
        parseValueBinaryOperationOrExpression(args)
      ),
    })
  }
  /**
   * Specify a where condition for the update operation.
   *
   * See {@link WhereInterface.whereRef} for more info.
   */
  whereRef(lhs, op, rhs) {
    return new OnConflictUpdateBuilder({
      ...this.#props,
      onConflictNode: OnConflictNode.cloneWithUpdateWhere(
        this.#props.onConflictNode,
        parseReferentialBinaryOperation(lhs, op, rhs)
      ),
    })
  }
  clearWhere() {
    return new OnConflictUpdateBuilder({
      ...this.#props,
      onConflictNode: OnConflictNode.cloneWithoutUpdateWhere(
        this.#props.onConflictNode
      ),
    })
  }
  /**
   * Simply calls the provided function passing `this` as the only argument. `$call` returns
   * what the provided function returns.
   */
  $call(func) {
    return func(this)
  }
  toOperationNode() {
    return this.#props.onConflictNode
  }
}
