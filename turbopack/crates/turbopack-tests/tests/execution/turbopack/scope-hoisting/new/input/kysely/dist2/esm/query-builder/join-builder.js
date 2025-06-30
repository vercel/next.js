/// <reference types="./join-builder.d.ts" />
import { JoinNode } from '../operation-node/join-node.js'
import { RawNode } from '../operation-node/raw-node.js'
import {
  parseValueBinaryOperationOrExpression,
  parseReferentialBinaryOperation,
} from '../parser/binary-operation-parser.js'
import { freeze } from '../util/object-utils.js'
export class JoinBuilder {
  #props
  constructor(props) {
    this.#props = freeze(props)
  }
  on(...args) {
    return new JoinBuilder({
      ...this.#props,
      joinNode: JoinNode.cloneWithOn(
        this.#props.joinNode,
        parseValueBinaryOperationOrExpression(args)
      ),
    })
  }
  /**
   * Just like {@link WhereInterface.whereRef} but adds an item to the join's
   * `on` clause instead.
   *
   * See {@link WhereInterface.whereRef} for documentation and examples.
   */
  onRef(lhs, op, rhs) {
    return new JoinBuilder({
      ...this.#props,
      joinNode: JoinNode.cloneWithOn(
        this.#props.joinNode,
        parseReferentialBinaryOperation(lhs, op, rhs)
      ),
    })
  }
  /**
   * Adds `on true`.
   */
  onTrue() {
    return new JoinBuilder({
      ...this.#props,
      joinNode: JoinNode.cloneWithOn(
        this.#props.joinNode,
        RawNode.createWithSql('true')
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
    return this.#props.joinNode
  }
}
