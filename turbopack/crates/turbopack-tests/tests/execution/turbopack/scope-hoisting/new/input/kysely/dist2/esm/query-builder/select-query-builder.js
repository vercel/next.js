/// <reference types="./select-query-builder.d.ts" />
import { AliasNode } from '../operation-node/alias-node.js'
import { SelectModifierNode } from '../operation-node/select-modifier-node.js'
import { parseJoin } from '../parser/join-parser.js'
import { parseTable } from '../parser/table-parser.js'
import { parseSelectArg, parseSelectAll } from '../parser/select-parser.js'
import { parseReferenceExpressionOrList } from '../parser/reference-parser.js'
import { SelectQueryNode } from '../operation-node/select-query-node.js'
import { QueryNode } from '../operation-node/query-node.js'
import { parseOrderBy } from '../parser/order-by-parser.js'
import { LimitNode } from '../operation-node/limit-node.js'
import { OffsetNode } from '../operation-node/offset-node.js'
import { asArray, freeze } from '../util/object-utils.js'
import { parseGroupBy } from '../parser/group-by-parser.js'
import { isNoResultErrorConstructor, NoResultError } from './no-result-error.js'
import { IdentifierNode } from '../operation-node/identifier-node.js'
import { parseSetOperations } from '../parser/set-operation-parser.js'
import {
  parseValueBinaryOperationOrExpression,
  parseReferentialBinaryOperation,
} from '../parser/binary-operation-parser.js'
import { ExpressionWrapper } from '../expression/expression-wrapper.js'
import { parseValueExpression } from '../parser/value-parser.js'
import { parseFetch } from '../parser/fetch-parser.js'
import { parseTop } from '../parser/top-parser.js'
class SelectQueryBuilderImpl {
  #props
  constructor(props) {
    this.#props = freeze(props)
  }
  get expressionType() {
    return undefined
  }
  get isSelectQueryBuilder() {
    return true
  }
  where(...args) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: QueryNode.cloneWithWhere(
        this.#props.queryNode,
        parseValueBinaryOperationOrExpression(args)
      ),
    })
  }
  whereRef(lhs, op, rhs) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: QueryNode.cloneWithWhere(
        this.#props.queryNode,
        parseReferentialBinaryOperation(lhs, op, rhs)
      ),
    })
  }
  having(...args) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: SelectQueryNode.cloneWithHaving(
        this.#props.queryNode,
        parseValueBinaryOperationOrExpression(args)
      ),
    })
  }
  havingRef(lhs, op, rhs) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: SelectQueryNode.cloneWithHaving(
        this.#props.queryNode,
        parseReferentialBinaryOperation(lhs, op, rhs)
      ),
    })
  }
  select(selection) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: SelectQueryNode.cloneWithSelections(
        this.#props.queryNode,
        parseSelectArg(selection)
      ),
    })
  }
  distinctOn(selection) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: SelectQueryNode.cloneWithDistinctOn(
        this.#props.queryNode,
        parseReferenceExpressionOrList(selection)
      ),
    })
  }
  modifyFront(modifier) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: SelectQueryNode.cloneWithFrontModifier(
        this.#props.queryNode,
        SelectModifierNode.createWithExpression(modifier.toOperationNode())
      ),
    })
  }
  modifyEnd(modifier) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: QueryNode.cloneWithEndModifier(
        this.#props.queryNode,
        SelectModifierNode.createWithExpression(modifier.toOperationNode())
      ),
    })
  }
  distinct() {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: SelectQueryNode.cloneWithFrontModifier(
        this.#props.queryNode,
        SelectModifierNode.create('Distinct')
      ),
    })
  }
  forUpdate(of) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: QueryNode.cloneWithEndModifier(
        this.#props.queryNode,
        SelectModifierNode.create(
          'ForUpdate',
          of ? asArray(of).map(parseTable) : undefined
        )
      ),
    })
  }
  forShare(of) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: QueryNode.cloneWithEndModifier(
        this.#props.queryNode,
        SelectModifierNode.create(
          'ForShare',
          of ? asArray(of).map(parseTable) : undefined
        )
      ),
    })
  }
  forKeyShare(of) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: QueryNode.cloneWithEndModifier(
        this.#props.queryNode,
        SelectModifierNode.create(
          'ForKeyShare',
          of ? asArray(of).map(parseTable) : undefined
        )
      ),
    })
  }
  forNoKeyUpdate(of) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: QueryNode.cloneWithEndModifier(
        this.#props.queryNode,
        SelectModifierNode.create(
          'ForNoKeyUpdate',
          of ? asArray(of).map(parseTable) : undefined
        )
      ),
    })
  }
  skipLocked() {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: QueryNode.cloneWithEndModifier(
        this.#props.queryNode,
        SelectModifierNode.create('SkipLocked')
      ),
    })
  }
  noWait() {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: QueryNode.cloneWithEndModifier(
        this.#props.queryNode,
        SelectModifierNode.create('NoWait')
      ),
    })
  }
  selectAll(table) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: SelectQueryNode.cloneWithSelections(
        this.#props.queryNode,
        parseSelectAll(table)
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
  crossJoin(...args) {
    return this.#join('CrossJoin', args)
  }
  innerJoinLateral(...args) {
    return this.#join('LateralInnerJoin', args)
  }
  leftJoinLateral(...args) {
    return this.#join('LateralLeftJoin', args)
  }
  crossJoinLateral(...args) {
    return this.#join('LateralCrossJoin', args)
  }
  crossApply(...args) {
    return this.#join('CrossApply', args)
  }
  outerApply(...args) {
    return this.#join('OuterApply', args)
  }
  #join(joinType, args) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: QueryNode.cloneWithJoin(
        this.#props.queryNode,
        parseJoin(joinType, args)
      ),
    })
  }
  orderBy(...args) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: QueryNode.cloneWithOrderByItems(
        this.#props.queryNode,
        parseOrderBy(args)
      ),
    })
  }
  groupBy(groupBy) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: SelectQueryNode.cloneWithGroupByItems(
        this.#props.queryNode,
        parseGroupBy(groupBy)
      ),
    })
  }
  limit(limit) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: SelectQueryNode.cloneWithLimit(
        this.#props.queryNode,
        LimitNode.create(parseValueExpression(limit))
      ),
    })
  }
  offset(offset) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: SelectQueryNode.cloneWithOffset(
        this.#props.queryNode,
        OffsetNode.create(parseValueExpression(offset))
      ),
    })
  }
  fetch(rowCount, modifier = 'only') {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: SelectQueryNode.cloneWithFetch(
        this.#props.queryNode,
        parseFetch(rowCount, modifier)
      ),
    })
  }
  top(expression, modifiers) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: QueryNode.cloneWithTop(
        this.#props.queryNode,
        parseTop(expression, modifiers)
      ),
    })
  }
  union(expression) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: SelectQueryNode.cloneWithSetOperations(
        this.#props.queryNode,
        parseSetOperations('union', expression, false)
      ),
    })
  }
  unionAll(expression) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: SelectQueryNode.cloneWithSetOperations(
        this.#props.queryNode,
        parseSetOperations('union', expression, true)
      ),
    })
  }
  intersect(expression) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: SelectQueryNode.cloneWithSetOperations(
        this.#props.queryNode,
        parseSetOperations('intersect', expression, false)
      ),
    })
  }
  intersectAll(expression) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: SelectQueryNode.cloneWithSetOperations(
        this.#props.queryNode,
        parseSetOperations('intersect', expression, true)
      ),
    })
  }
  except(expression) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: SelectQueryNode.cloneWithSetOperations(
        this.#props.queryNode,
        parseSetOperations('except', expression, false)
      ),
    })
  }
  exceptAll(expression) {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: SelectQueryNode.cloneWithSetOperations(
        this.#props.queryNode,
        parseSetOperations('except', expression, true)
      ),
    })
  }
  as(alias) {
    return new AliasedSelectQueryBuilderImpl(this, alias)
  }
  clearSelect() {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: SelectQueryNode.cloneWithoutSelections(this.#props.queryNode),
    })
  }
  clearWhere() {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: QueryNode.cloneWithoutWhere(this.#props.queryNode),
    })
  }
  clearLimit() {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: SelectQueryNode.cloneWithoutLimit(this.#props.queryNode),
    })
  }
  clearOffset() {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: SelectQueryNode.cloneWithoutOffset(this.#props.queryNode),
    })
  }
  clearOrderBy() {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: QueryNode.cloneWithoutOrderBy(this.#props.queryNode),
    })
  }
  clearGroupBy() {
    return new SelectQueryBuilderImpl({
      ...this.#props,
      queryNode: SelectQueryNode.cloneWithoutGroupBy(this.#props.queryNode),
    })
  }
  $call(func) {
    return func(this)
  }
  $if(condition, func) {
    if (condition) {
      return func(this)
    }
    return new SelectQueryBuilderImpl({
      ...this.#props,
    })
  }
  $castTo() {
    return new SelectQueryBuilderImpl(this.#props)
  }
  $narrowType() {
    return new SelectQueryBuilderImpl(this.#props)
  }
  $assertType() {
    return new SelectQueryBuilderImpl(this.#props)
  }
  $asTuple() {
    return new ExpressionWrapper(this.toOperationNode())
  }
  $asScalar() {
    return new ExpressionWrapper(this.toOperationNode())
  }
  withPlugin(plugin) {
    return new SelectQueryBuilderImpl({
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
  async execute() {
    const compiledQuery = this.compile()
    const result = await this.#props.executor.executeQuery(
      compiledQuery,
      this.#props.queryId
    )
    return result.rows
  }
  async executeTakeFirst() {
    const [result] = await this.execute()
    return result
  }
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
    const builder = new SelectQueryBuilderImpl({
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
export function createSelectQueryBuilder(props) {
  return new SelectQueryBuilderImpl(props)
}
/**
 * {@link SelectQueryBuilder} with an alias. The result of calling {@link SelectQueryBuilder.as}.
 */
class AliasedSelectQueryBuilderImpl {
  #queryBuilder
  #alias
  constructor(queryBuilder, alias) {
    this.#queryBuilder = queryBuilder
    this.#alias = alias
  }
  get expression() {
    return this.#queryBuilder
  }
  get alias() {
    return this.#alias
  }
  get isAliasedSelectQueryBuilder() {
    return true
  }
  toOperationNode() {
    return AliasNode.create(
      this.#queryBuilder.toOperationNode(),
      IdentifierNode.create(this.#alias)
    )
  }
}
