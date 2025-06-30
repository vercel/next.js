/// <reference types="./expression-wrapper.d.ts" />
import { AliasNode } from '../operation-node/alias-node.js'
import { AndNode } from '../operation-node/and-node.js'
import { IdentifierNode } from '../operation-node/identifier-node.js'
import { isOperationNodeSource } from '../operation-node/operation-node-source.js'
import { OrNode } from '../operation-node/or-node.js'
import { ParensNode } from '../operation-node/parens-node.js'
import { parseValueBinaryOperationOrExpression } from '../parser/binary-operation-parser.js'
export class ExpressionWrapper {
  #node
  constructor(node) {
    this.#node = node
  }
  /** @private */
  get expressionType() {
    return undefined
  }
  as(alias) {
    return new AliasedExpressionWrapper(this, alias)
  }
  or(...args) {
    return new OrWrapper(
      OrNode.create(this.#node, parseValueBinaryOperationOrExpression(args))
    )
  }
  and(...args) {
    return new AndWrapper(
      AndNode.create(this.#node, parseValueBinaryOperationOrExpression(args))
    )
  }
  /**
   * Change the output type of the expression.
   *
   * This method call doesn't change the SQL in any way. This methods simply
   * returns a copy of this `ExpressionWrapper` with a new output type.
   */
  $castTo() {
    return new ExpressionWrapper(this.#node)
  }
  /**
   * Omit null from the expression's type.
   *
   * This function can be useful in cases where you know an expression can't be
   * null, but Kysely is unable to infer it.
   *
   * This method call doesn't change the SQL in any way. This methods simply
   * returns a copy of `this` with a new output type.
   */
  $notNull() {
    return new ExpressionWrapper(this.#node)
  }
  toOperationNode() {
    return this.#node
  }
}
export class AliasedExpressionWrapper {
  #expr
  #alias
  constructor(expr, alias) {
    this.#expr = expr
    this.#alias = alias
  }
  /** @private */
  get expression() {
    return this.#expr
  }
  /** @private */
  get alias() {
    return this.#alias
  }
  toOperationNode() {
    return AliasNode.create(
      this.#expr.toOperationNode(),
      isOperationNodeSource(this.#alias)
        ? this.#alias.toOperationNode()
        : IdentifierNode.create(this.#alias)
    )
  }
}
export class OrWrapper {
  #node
  constructor(node) {
    this.#node = node
  }
  /** @private */
  get expressionType() {
    return undefined
  }
  as(alias) {
    return new AliasedExpressionWrapper(this, alias)
  }
  or(...args) {
    return new OrWrapper(
      OrNode.create(this.#node, parseValueBinaryOperationOrExpression(args))
    )
  }
  /**
   * Change the output type of the expression.
   *
   * This method call doesn't change the SQL in any way. This methods simply
   * returns a copy of this `OrWrapper` with a new output type.
   */
  $castTo() {
    return new OrWrapper(this.#node)
  }
  toOperationNode() {
    return ParensNode.create(this.#node)
  }
}
export class AndWrapper {
  #node
  constructor(node) {
    this.#node = node
  }
  /** @private */
  get expressionType() {
    return undefined
  }
  as(alias) {
    return new AliasedExpressionWrapper(this, alias)
  }
  and(...args) {
    return new AndWrapper(
      AndNode.create(this.#node, parseValueBinaryOperationOrExpression(args))
    )
  }
  /**
   * Change the output type of the expression.
   *
   * This method call doesn't change the SQL in any way. This methods simply
   * returns a copy of this `AndWrapper` with a new output type.
   */
  $castTo() {
    return new AndWrapper(this.#node)
  }
  toOperationNode() {
    return ParensNode.create(this.#node)
  }
}
