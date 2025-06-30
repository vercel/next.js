/// <reference types="./over-builder.d.ts" />
import { OverNode } from '../operation-node/over-node.js'
import { QueryNode } from '../operation-node/query-node.js'
import { parseOrderBy } from '../parser/order-by-parser.js'
import { parsePartitionBy } from '../parser/partition-by-parser.js'
import { freeze } from '../util/object-utils.js'
export class OverBuilder {
  #props
  constructor(props) {
    this.#props = freeze(props)
  }
  orderBy(...args) {
    return new OverBuilder({
      overNode: OverNode.cloneWithOrderByItems(
        this.#props.overNode,
        parseOrderBy(args)
      ),
    })
  }
  clearOrderBy() {
    return new OverBuilder({
      overNode: QueryNode.cloneWithoutOrderBy(this.#props.overNode),
    })
  }
  partitionBy(partitionBy) {
    return new OverBuilder({
      overNode: OverNode.cloneWithPartitionByItems(
        this.#props.overNode,
        parsePartitionBy(partitionBy)
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
    return this.#props.overNode
  }
}
