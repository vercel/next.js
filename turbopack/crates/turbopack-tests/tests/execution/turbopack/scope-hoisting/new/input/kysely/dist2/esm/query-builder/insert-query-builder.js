/// <reference types="./insert-query-builder.d.ts" />
import { parseSelectArg, parseSelectAll } from '../parser/select-parser.js'
import { parseInsertExpression } from '../parser/insert-values-parser.js'
import { InsertQueryNode } from '../operation-node/insert-query-node.js'
import { QueryNode } from '../operation-node/query-node.js'
import { parseUpdateObjectExpression } from '../parser/update-set-parser.js'
import { freeze } from '../util/object-utils.js'
import { OnDuplicateKeyNode } from '../operation-node/on-duplicate-key-node.js'
import { InsertResult } from './insert-result.js'
import { isNoResultErrorConstructor, NoResultError } from './no-result-error.js'
import { parseExpression } from '../parser/expression-parser.js'
import { ColumnNode } from '../operation-node/column-node.js'
import { OnConflictBuilder } from './on-conflict-builder.js'
import { OnConflictNode } from '../operation-node/on-conflict-node.js'
import { parseTop } from '../parser/top-parser.js'
import { OrActionNode } from '../operation-node/or-action-node.js'
export class InsertQueryBuilder {
  #props
  constructor(props) {
    this.#props = freeze(props)
  }
  /**
   * Sets the values to insert for an {@link Kysely.insertInto | insert} query.
   *
   * This method takes an object whose keys are column names and values are
   * values to insert. In addition to the column's type, the values can be
   * raw {@link sql} snippets or select queries.
   *
   * You must provide all fields you haven't explicitly marked as nullable
   * or optional using {@link Generated} or {@link ColumnType}.
   *
   * The return value of an `insert` query is an instance of {@link InsertResult}. The
   * {@link InsertResult.insertId | insertId} field holds the auto incremented primary
   * key if the database returned one.
   *
   * On PostgreSQL and some other dialects, you need to call `returning` to get
   * something out of the query.
   *
   * Also see the {@link expression} method for inserting the result of a select
   * query or any other expression.
   *
   * ### Examples
   *
   * <!-- siteExample("insert", "Single row", 10) -->
   *
   * Insert a single row:
   *
   * ```ts
   * const result = await db
   *   .insertInto('person')
   *   .values({
   *     first_name: 'Jennifer',
   *     last_name: 'Aniston',
   *     age: 40
   *   })
   *   .executeTakeFirst()
   *
   * // `insertId` is only available on dialects that
   * // automatically return the id of the inserted row
   * // such as MySQL and SQLite. On PostgreSQL, for example,
   * // you need to add a `returning` clause to the query to
   * // get anything out. See the "returning data" example.
   * console.log(result.insertId)
   * ```
   *
   * The generated SQL (MySQL):
   *
   * ```sql
   * insert into `person` (`first_name`, `last_name`, `age`) values (?, ?, ?)
   * ```
   *
   * <!-- siteExample("insert", "Multiple rows", 20) -->
   *
   * On dialects that support it (for example PostgreSQL) you can insert multiple
   * rows by providing an array. Note that the return value is once again very
   * dialect-specific. Some databases may only return the id of the *last* inserted
   * row and some return nothing at all unless you call `returning`.
   *
   * ```ts
   * await db
   *   .insertInto('person')
   *   .values([{
   *     first_name: 'Jennifer',
   *     last_name: 'Aniston',
   *     age: 40,
   *   }, {
   *     first_name: 'Arnold',
   *     last_name: 'Schwarzenegger',
   *     age: 70,
   *   }])
   *   .execute()
   * ```
   *
   * The generated SQL (PostgreSQL):
   *
   * ```sql
   * insert into "person" ("first_name", "last_name", "age") values (($1, $2, $3), ($4, $5, $6))
   * ```
   *
   * <!-- siteExample("insert", "Returning data", 30) -->
   *
   * On supported dialects like PostgreSQL you need to chain `returning` to the query to get
   * the inserted row's columns (or any other expression) as the return value. `returning`
   * works just like `select`. Refer to `select` method's examples and documentation for
   * more info.
   *
   * ```ts
   * const result = await db
   *   .insertInto('person')
   *   .values({
   *     first_name: 'Jennifer',
   *     last_name: 'Aniston',
   *     age: 40,
   *   })
   *   .returning(['id', 'first_name as name'])
   *   .executeTakeFirstOrThrow()
   * ```
   *
   * The generated SQL (PostgreSQL):
   *
   * ```sql
   * insert into "person" ("first_name", "last_name", "age") values ($1, $2, $3) returning "id", "first_name" as "name"
   * ```
   *
   * <!-- siteExample("insert", "Complex values", 40) -->
   *
   * In addition to primitives, the values can also be arbitrary expressions.
   * You can build the expressions by using a callback and calling the methods
   * on the expression builder passed to it:
   *
   * ```ts
   * import { sql } from 'kysely'
   *
   * const ani = "Ani"
   * const ston = "ston"
   *
   * const result = await db
   *   .insertInto('person')
   *   .values(({ ref, selectFrom, fn }) => ({
   *     first_name: 'Jennifer',
   *     last_name: sql<string>`concat(${ani}, ${ston})`,
   *     middle_name: ref('first_name'),
   *     age: selectFrom('person')
   *       .select(fn.avg<number>('age').as('avg_age')),
   *   }))
   *   .executeTakeFirst()
   * ```
   *
   * The generated SQL (PostgreSQL):
   *
   * ```sql
   * insert into "person" (
   *   "first_name",
   *   "last_name",
   *   "middle_name",
   *   "age"
   * )
   * values (
   *   $1,
   *   concat($2, $3),
   *   "first_name",
   *   (select avg("age") as "avg_age" from "person")
   * )
   * ```
   *
   * You can also use the callback version of subqueries or raw expressions:
   *
   * ```ts
   * await db.with('jennifer', (db) => db
   *   .selectFrom('person')
   *   .where('first_name', '=', 'Jennifer')
   *   .select(['id', 'first_name', 'gender'])
   *   .limit(1)
   * ).insertInto('pet').values((eb) => ({
   *   owner_id: eb.selectFrom('jennifer').select('id'),
   *   name: eb.selectFrom('jennifer').select('first_name'),
   *   species: 'cat',
   * }))
   * .execute()
   * ```
   *
   * The generated SQL (PostgreSQL):
   *
   * ```sql
   * with "jennifer" as (
   *   select "id", "first_name", "gender"
   *   from "person"
   *   where "first_name" = $1
   *   limit $2
   * )
   * insert into "pet" ("owner_id", "name", "species")
   * values (
   *  (select "id" from "jennifer"),
   *  (select "first_name" from "jennifer"),
   *  $3
   * )
   * ```
   */
  values(insert) {
    const [columns, values] = parseInsertExpression(insert)
    return new InsertQueryBuilder({
      ...this.#props,
      queryNode: InsertQueryNode.cloneWith(this.#props.queryNode, {
        columns,
        values,
      }),
    })
  }
  /**
   * Sets the columns to insert.
   *
   * The {@link values} method sets both the columns and the values and this method
   * is not needed. But if you are using the {@link expression} method, you can use
   * this method to set the columns to insert.
   *
   * ### Examples
   *
   * ```ts
   * await db.insertInto('person')
   *   .columns(['first_name'])
   *   .expression((eb) => eb.selectFrom('pet').select('pet.name'))
   *   .execute()
   * ```
   *
   * The generated SQL (PostgreSQL):
   *
   * ```sql
   * insert into "person" ("first_name")
   * select "pet"."name" from "pet"
   * ```
   */
  columns(columns) {
    return new InsertQueryBuilder({
      ...this.#props,
      queryNode: InsertQueryNode.cloneWith(this.#props.queryNode, {
        columns: freeze(columns.map(ColumnNode.create)),
      }),
    })
  }
  /**
   * Insert an arbitrary expression. For example the result of a select query.
   *
   * ### Examples
   *
   * <!-- siteExample("insert", "Insert subquery", 50) -->
   *
   * You can create an `INSERT INTO SELECT FROM` query using the `expression` method.
   * This API doesn't follow our WYSIWYG principles and might be a bit difficult to
   * remember. The reasons for this design stem from implementation difficulties.
   *
   * ```ts
   * const result = await db.insertInto('person')
   *   .columns(['first_name', 'last_name', 'age'])
   *   .expression((eb) => eb
   *     .selectFrom('pet')
   *     .select((eb) => [
   *       'pet.name',
   *       eb.val('Petson').as('last_name'),
   *       eb.lit(7).as('age'),
   *     ])
   *   )
   *   .execute()
   * ```
   *
   * The generated SQL (PostgreSQL):
   *
   * ```sql
   * insert into "person" ("first_name", "last_name", "age")
   * select "pet"."name", $1 as "last_name", 7 as "age from "pet"
   * ```
   */
  expression(expression) {
    return new InsertQueryBuilder({
      ...this.#props,
      queryNode: InsertQueryNode.cloneWith(this.#props.queryNode, {
        values: parseExpression(expression),
      }),
    })
  }
  /**
   * Creates an `insert into "person" default values` query.
   *
   * ### Examples
   *
   * ```ts
   * await db.insertInto('person')
   *   .defaultValues()
   *   .execute()
   * ```
   *
   * The generated SQL (PostgreSQL):
   *
   * ```sql
   * insert into "person" default values
   * ```
   */
  defaultValues() {
    return new InsertQueryBuilder({
      ...this.#props,
      queryNode: InsertQueryNode.cloneWith(this.#props.queryNode, {
        defaultValues: true,
      }),
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
   * await db.insertInto('person')
   *   .values({
   *     first_name: 'John',
   *     last_name: 'Doe',
   *     gender: 'male',
   *   })
   *   .modifyEnd(sql`-- This is a comment`)
   *   .execute()
   * ```
   *
   * The generated SQL (MySQL):
   *
   * ```sql
   * insert into `person` ("first_name", "last_name", "gender")
   * values (?, ?, ?) -- This is a comment
   * ```
   */
  modifyEnd(modifier) {
    return new InsertQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithEndModifier(
        this.#props.queryNode,
        modifier.toOperationNode()
      ),
    })
  }
  /**
   * Changes an `insert into` query to an `insert ignore into` query.
   *
   * This is only supported by some dialects like MySQL.
   *
   * To avoid a footgun, when invoked with the SQLite dialect, this method will
   * be handled like {@link orIgnore}. See also, {@link orAbort}, {@link orFail},
   * {@link orReplace}, and {@link orRollback}.
   *
   * If you use the ignore modifier, ignorable errors that occur while executing the
   * insert statement are ignored. For example, without ignore, a row that duplicates
   * an existing unique index or primary key value in the table causes a duplicate-key
   * error and the statement is aborted. With ignore, the row is discarded and no error
   * occurs.
   *
   * ### Examples
   *
   * ```ts
   * await db.insertInto('person')
   *   .ignore()
   *   .values({
   *     first_name: 'John',
   *     last_name: 'Doe',
   *     gender: 'female',
   *   })
   *   .execute()
   * ```
   *
   * The generated SQL (MySQL):
   *
   * ```sql
   * insert ignore into `person` (`first_name`, `last_name`, `gender`) values (?, ?, ?)
   * ```
   *
   * The generated SQL (SQLite):
   *
   * ```sql
   * insert or ignore into "person" ("first_name", "last_name", "gender") values (?, ?, ?)
   * ```
   */
  ignore() {
    return new InsertQueryBuilder({
      ...this.#props,
      queryNode: InsertQueryNode.cloneWith(this.#props.queryNode, {
        orAction: OrActionNode.create('ignore'),
      }),
    })
  }
  /**
   * Changes an `insert into` query to an `insert or ignore into` query.
   *
   * This is only supported by some dialects like SQLite.
   *
   * To avoid a footgun, when invoked with the MySQL dialect, this method will
   * be handled like {@link ignore}.
   *
   * See also, {@link orAbort}, {@link orFail}, {@link orReplace}, and {@link orRollback}.
   *
   * ### Examples
   *
   * ```ts
   * await db.insertInto('person')
   *   .orIgnore()
   *   .values({
   *     first_name: 'John',
   *     last_name: 'Doe',
   *     gender: 'female',
   *   })
   *   .execute()
   * ```
   *
   * The generated SQL (SQLite):
   *
   * ```sql
   * insert or ignore into "person" ("first_name", "last_name", "gender") values (?, ?, ?)
   * ```
   *
   * The generated SQL (MySQL):
   *
   * ```sql
   * insert ignore into `person` (`first_name`, `last_name`, `gender`) values (?, ?, ?)
   * ```
   */
  orIgnore() {
    return new InsertQueryBuilder({
      ...this.#props,
      queryNode: InsertQueryNode.cloneWith(this.#props.queryNode, {
        orAction: OrActionNode.create('ignore'),
      }),
    })
  }
  /**
   * Changes an `insert into` query to an `insert or abort into` query.
   *
   * This is only supported by some dialects like SQLite.
   *
   * See also, {@link orIgnore}, {@link orFail}, {@link orReplace}, and {@link orRollback}.
   *
   * ### Examples
   *
   * ```ts
   * await db.insertInto('person')
   *   .orAbort()
   *   .values({
   *     first_name: 'John',
   *     last_name: 'Doe',
   *     gender: 'female',
   *   })
   *   .execute()
   * ```
   *
   * The generated SQL (SQLite):
   *
   * ```sql
   * insert or abort into "person" ("first_name", "last_name", "gender") values (?, ?, ?)
   * ```
   */
  orAbort() {
    return new InsertQueryBuilder({
      ...this.#props,
      queryNode: InsertQueryNode.cloneWith(this.#props.queryNode, {
        orAction: OrActionNode.create('abort'),
      }),
    })
  }
  /**
   * Changes an `insert into` query to an `insert or fail into` query.
   *
   * This is only supported by some dialects like SQLite.
   *
   * See also, {@link orIgnore}, {@link orAbort}, {@link orReplace}, and {@link orRollback}.
   *
   * ### Examples
   *
   * ```ts
   * await db.insertInto('person')
   *   .orFail()
   *   .values({
   *     first_name: 'John',
   *     last_name: 'Doe',
   *     gender: 'female',
   *   })
   *   .execute()
   * ```
   *
   * The generated SQL (SQLite):
   *
   * ```sql
   * insert or fail into "person" ("first_name", "last_name", "gender") values (?, ?, ?)
   * ```
   */
  orFail() {
    return new InsertQueryBuilder({
      ...this.#props,
      queryNode: InsertQueryNode.cloneWith(this.#props.queryNode, {
        orAction: OrActionNode.create('fail'),
      }),
    })
  }
  /**
   * Changes an `insert into` query to an `insert or replace into` query.
   *
   * This is only supported by some dialects like SQLite.
   *
   * You can also use {@link Kysely.replaceInto} to achieve the same result.
   *
   * See also, {@link orIgnore}, {@link orAbort}, {@link orFail}, and {@link orRollback}.
   *
   * ### Examples
   *
   * ```ts
   * await db.insertInto('person')
   *   .orReplace()
   *   .values({
   *     first_name: 'John',
   *     last_name: 'Doe',
   *     gender: 'female',
   *   })
   *   .execute()
   * ```
   *
   * The generated SQL (SQLite):
   *
   * ```sql
   * insert or replace into "person" ("first_name", "last_name", "gender") values (?, ?, ?)
   * ```
   */
  orReplace() {
    return new InsertQueryBuilder({
      ...this.#props,
      queryNode: InsertQueryNode.cloneWith(this.#props.queryNode, {
        orAction: OrActionNode.create('replace'),
      }),
    })
  }
  /**
   * Changes an `insert into` query to an `insert or rollback into` query.
   *
   * This is only supported by some dialects like SQLite.
   *
   * See also, {@link orIgnore}, {@link orAbort}, {@link orFail}, and {@link orReplace}.
   *
   * ### Examples
   *
   * ```ts
   * await db.insertInto('person')
   *   .orRollback()
   *   .values({
   *     first_name: 'John',
   *     last_name: 'Doe',
   *     gender: 'female',
   *   })
   *   .execute()
   * ```
   *
   * The generated SQL (SQLite):
   *
   * ```sql
   * insert or rollback into "person" ("first_name", "last_name", "gender") values (?, ?, ?)
   * ```
   */
  orRollback() {
    return new InsertQueryBuilder({
      ...this.#props,
      queryNode: InsertQueryNode.cloneWith(this.#props.queryNode, {
        orAction: OrActionNode.create('rollback'),
      }),
    })
  }
  /**
   * Changes an `insert into` query to an `insert top into` query.
   *
   * `top` clause is only supported by some dialects like MS SQL Server.
   *
   * ### Examples
   *
   * Insert the first 5 rows:
   *
   * ```ts
   * import { sql } from 'kysely'
   *
   * await db.insertInto('person')
   *   .top(5)
   *   .columns(['first_name', 'gender'])
   *   .expression(
   *     (eb) => eb.selectFrom('pet').select(['name', sql.lit('other').as('gender')])
   *   )
   *   .execute()
   * ```
   *
   * The generated SQL (MS SQL Server):
   *
   * ```sql
   * insert top(5) into "person" ("first_name", "gender") select "name", 'other' as "gender" from "pet"
   * ```
   *
   * Insert the first 50 percent of rows:
   *
   * ```ts
   * import { sql } from 'kysely'
   *
   * await db.insertInto('person')
   *   .top(50, 'percent')
   *   .columns(['first_name', 'gender'])
   *   .expression(
   *     (eb) => eb.selectFrom('pet').select(['name', sql.lit('other').as('gender')])
   *   )
   *   .execute()
   * ```
   *
   * The generated SQL (MS SQL Server):
   *
   * ```sql
   * insert top(50) percent into "person" ("first_name", "gender") select "name", 'other' as "gender" from "pet"
   * ```
   */
  top(expression, modifiers) {
    return new InsertQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithTop(
        this.#props.queryNode,
        parseTop(expression, modifiers)
      ),
    })
  }
  /**
   * Adds an `on conflict` clause to the query.
   *
   * `on conflict` is only supported by some dialects like PostgreSQL and SQLite. On MySQL
   * you can use {@link ignore} and {@link onDuplicateKeyUpdate} to achieve similar results.
   *
   * ### Examples
   *
   * ```ts
   * await db
   *   .insertInto('pet')
   *   .values({
   *     name: 'Catto',
   *     species: 'cat',
   *     owner_id: 3,
   *   })
   *   .onConflict((oc) => oc
   *     .column('name')
   *     .doUpdateSet({ species: 'hamster' })
   *   )
   *   .execute()
   * ```
   *
   * The generated SQL (PostgreSQL):
   *
   * ```sql
   * insert into "pet" ("name", "species", "owner_id")
   * values ($1, $2, $3)
   * on conflict ("name")
   * do update set "species" = $4
   * ```
   *
   * You can provide the name of the constraint instead of a column name:
   *
   * ```ts
   * await db
   *   .insertInto('pet')
   *   .values({
   *     name: 'Catto',
   *     species: 'cat',
   *     owner_id: 3,
   *   })
   *   .onConflict((oc) => oc
   *     .constraint('pet_name_key')
   *     .doUpdateSet({ species: 'hamster' })
   *   )
   *   .execute()
   * ```
   *
   * The generated SQL (PostgreSQL):
   *
   * ```sql
   * insert into "pet" ("name", "species", "owner_id")
   * values ($1, $2, $3)
   * on conflict on constraint "pet_name_key"
   * do update set "species" = $4
   * ```
   *
   * You can also specify an expression as the conflict target in case
   * the unique index is an expression index:
   *
   * ```ts
   * import { sql } from 'kysely'
   *
   * await db
   *   .insertInto('pet')
   *   .values({
   *     name: 'Catto',
   *     species: 'cat',
   *     owner_id: 3,
   *   })
   *   .onConflict((oc) => oc
   *     .expression(sql<string>`lower(name)`)
   *     .doUpdateSet({ species: 'hamster' })
   *   )
   *   .execute()
   * ```
   *
   * The generated SQL (PostgreSQL):
   *
   * ```sql
   * insert into "pet" ("name", "species", "owner_id")
   * values ($1, $2, $3)
   * on conflict (lower(name))
   * do update set "species" = $4
   * ```
   *
   * You can add a filter for the update statement like this:
   *
   * ```ts
   * await db
   *   .insertInto('pet')
   *   .values({
   *     name: 'Catto',
   *     species: 'cat',
   *     owner_id: 3,
   *   })
   *   .onConflict((oc) => oc
   *     .column('name')
   *     .doUpdateSet({ species: 'hamster' })
   *     .where('excluded.name', '!=', 'Catto')
   *   )
   *   .execute()
   * ```
   *
   * The generated SQL (PostgreSQL):
   *
   * ```sql
   * insert into "pet" ("name", "species", "owner_id")
   * values ($1, $2, $3)
   * on conflict ("name")
   * do update set "species" = $4
   * where "excluded"."name" != $5
   * ```
   *
   * You can create an `on conflict do nothing` clauses like this:
   *
   * ```ts
   * await db
   *   .insertInto('pet')
   *   .values({
   *     name: 'Catto',
   *     species: 'cat',
   *     owner_id: 3,
   *   })
   *   .onConflict((oc) => oc
   *     .column('name')
   *     .doNothing()
   *   )
   *   .execute()
   * ```
   *
   * The generated SQL (PostgreSQL):
   *
   * ```sql
   * insert into "pet" ("name", "species", "owner_id")
   * values ($1, $2, $3)
   * on conflict ("name") do nothing
   * ```
   *
   * You can refer to the columns of the virtual `excluded` table
   * in a type-safe way using a callback and the `ref` method of
   * `ExpressionBuilder`:
   *
   * ```ts
   * await db.insertInto('person')
   *   .values({
   *     id: 1,
   *     first_name: 'John',
   *     last_name: 'Doe',
   *     gender: 'male',
   *   })
   *   .onConflict(oc => oc
   *     .column('id')
   *     .doUpdateSet({
   *       first_name: (eb) => eb.ref('excluded.first_name'),
   *       last_name: (eb) => eb.ref('excluded.last_name')
   *     })
   *   )
   *   .execute()
   * ```
   *
   * The generated SQL (PostgreSQL):
   *
   * ```sql
   * insert into "person" ("id", "first_name", "last_name", "gender")
   * values ($1, $2, $3, $4)
   * on conflict ("id")
   * do update set
   *  "first_name" = "excluded"."first_name",
   *  "last_name" = "excluded"."last_name"
   * ```
   */
  onConflict(callback) {
    return new InsertQueryBuilder({
      ...this.#props,
      queryNode: InsertQueryNode.cloneWith(this.#props.queryNode, {
        onConflict: callback(
          new OnConflictBuilder({
            onConflictNode: OnConflictNode.create(),
          })
        ).toOperationNode(),
      }),
    })
  }
  /**
   * Adds `on duplicate key update` to the query.
   *
   * If you specify `on duplicate key update`, and a row is inserted that would cause
   * a duplicate value in a unique index or primary key, an update of the old row occurs.
   *
   * This is only implemented by some dialects like MySQL. On most dialects you should
   * use {@link onConflict} instead.
   *
   * ### Examples
   *
   * ```ts
   * await db
   *   .insertInto('person')
   *   .values({
   *     id: 1,
   *     first_name: 'John',
   *     last_name: 'Doe',
   *     gender: 'male',
   *   })
   *   .onDuplicateKeyUpdate({ updated_at: new Date().toISOString() })
   *   .execute()
   * ```
   *
   * The generated SQL (MySQL):
   *
   * ```sql
   * insert into `person` (`id`, `first_name`, `last_name`, `gender`)
   * values (?, ?, ?, ?)
   * on duplicate key update `updated_at` = ?
   * ```
   */
  onDuplicateKeyUpdate(update) {
    return new InsertQueryBuilder({
      ...this.#props,
      queryNode: InsertQueryNode.cloneWith(this.#props.queryNode, {
        onDuplicateKey: OnDuplicateKeyNode.create(
          parseUpdateObjectExpression(update)
        ),
      }),
    })
  }
  returning(selection) {
    return new InsertQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithReturning(
        this.#props.queryNode,
        parseSelectArg(selection)
      ),
    })
  }
  returningAll() {
    return new InsertQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithReturning(
        this.#props.queryNode,
        parseSelectAll()
      ),
    })
  }
  output(args) {
    return new InsertQueryBuilder({
      ...this.#props,
      queryNode: QueryNode.cloneWithOutput(
        this.#props.queryNode,
        parseSelectArg(args)
      ),
    })
  }
  outputAll(table) {
    return new InsertQueryBuilder({
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
   * await db.insertInto('person')
   *   .values({ first_name: 'James', last_name: 'Smith', gender: 'male' })
   *   .returning(['first_name'])
   *   .clearReturning()
   *   .execute()
   * ```
   *
   * The generated SQL(PostgreSQL):
   *
   * ```sql
   * insert into "person" ("first_name", "last_name", "gender") values ($1, $2, $3)
   * ```
   */
  clearReturning() {
    return new InsertQueryBuilder({
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
   *
   * function log<T extends Compilable>(qb: T): T {
   *   console.log(qb.compile())
   *   return qb
   * }
   *
   * await db.insertInto('person')
   *   .values({ first_name: 'John', last_name: 'Doe', gender: 'male' })
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
   * import type { NewPerson } from 'type-editor' // imaginary module
   *
   * async function insertPerson(values: NewPerson, returnLastName: boolean) {
   *   return await db
   *     .insertInto('person')
   *     .values(values)
   *     .returning(['id', 'first_name'])
   *     .$if(returnLastName, (qb) => qb.returning('last_name'))
   *     .executeTakeFirstOrThrow()
   * }
   * ```
   *
   * Any selections added inside the `if` callback will be added as optional fields to the
   * output type since we can't know if the selections were actually made before running
   * the code. In the example above the return type of the `insertPerson` function is:
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
    return new InsertQueryBuilder({
      ...this.#props,
    })
  }
  /**
   * Change the output type of the query.
   *
   * This method call doesn't change the SQL in any way. This methods simply
   * returns a copy of this `InsertQueryBuilder` with a new output type.
   */
  $castTo() {
    return new InsertQueryBuilder(this.#props)
  }
  /**
   * Narrows (parts of) the output type of the query.
   *
   * Kysely tries to be as type-safe as possible, but in some cases we have to make
   * compromises for better maintainability and compilation performance. At present,
   * Kysely doesn't narrow the output type of the query based on {@link values} input
   * when using {@link returning} or {@link returningAll}.
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
   * const person = await db.insertInto('person')
   *   .values({
   *     first_name: 'John',
   *     last_name: 'Doe',
   *     gender: 'male',
   *     nullable_column: 'hell yeah!'
   *   })
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
   * const person = await db.insertInto('person')
   *   .values({
   *     first_name: 'John',
   *     last_name: 'Doe',
   *     gender: 'male',
   *     nullable_column: 'hell yeah!'
   *   })
   *   .returningAll()
   *   .$narrowType<{ nullable_column: NotNull }>()
   *   .executeTakeFirstOrThrow()
   *
   * functionThatExpectsPersonWithNonNullValue(person)
   * ```
   */
  $narrowType() {
    return new InsertQueryBuilder(this.#props)
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
   * import type { NewPerson, NewPet, Species } from 'type-editor' // imaginary module
   *
   * async function insertPersonAndPet(person: NewPerson, pet: Omit<NewPet, 'owner_id'>) {
   *   return await db
   *     .with('new_person', (qb) => qb
   *       .insertInto('person')
   *       .values(person)
   *       .returning('id')
   *       .$assertType<{ id: number }>()
   *     )
   *     .with('new_pet', (qb) => qb
   *       .insertInto('pet')
   *       .values((eb) => ({
   *         owner_id: eb.selectFrom('new_person').select('id'),
   *         ...pet
   *       }))
   *       .returning(['name as pet_name', 'species'])
   *       .$assertType<{ pet_name: string, species: Species }>()
   *     )
   *     .selectFrom(['new_person', 'new_pet'])
   *     .selectAll()
   *     .executeTakeFirstOrThrow()
   * }
   * ```
   */
  $assertType() {
    return new InsertQueryBuilder(this.#props)
  }
  /**
   * Returns a copy of this InsertQueryBuilder instance with the given plugin installed.
   */
  withPlugin(plugin) {
    return new InsertQueryBuilder({
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
      new InsertResult(result.insertId, result.numAffectedRows ?? BigInt(0)),
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
    const builder = new InsertQueryBuilder({
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
