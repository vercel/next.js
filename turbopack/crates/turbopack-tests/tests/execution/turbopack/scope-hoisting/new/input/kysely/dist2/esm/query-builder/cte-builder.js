/// <reference types="./cte-builder.d.ts" />
import { CommonTableExpressionNode } from '../operation-node/common-table-expression-node.js'
import { freeze } from '../util/object-utils.js'
export class CTEBuilder {
  #props
  constructor(props) {
    this.#props = freeze(props)
  }
  /**
   * Makes the common table expression materialized.
   */
  materialized() {
    return new CTEBuilder({
      ...this.#props,
      node: CommonTableExpressionNode.cloneWith(this.#props.node, {
        materialized: true,
      }),
    })
  }
  /**
   * Makes the common table expression not materialized.
   */
  notMaterialized() {
    return new CTEBuilder({
      ...this.#props,
      node: CommonTableExpressionNode.cloneWith(this.#props.node, {
        materialized: false,
      }),
    })
  }
  toOperationNode() {
    return this.#props.node
  }
}
