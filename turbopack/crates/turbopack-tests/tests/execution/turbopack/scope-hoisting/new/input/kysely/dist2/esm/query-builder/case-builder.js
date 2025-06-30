/// <reference types="./case-builder.d.ts" />
import { ExpressionWrapper } from '../expression/expression-wrapper.js'
import { freeze } from '../util/object-utils.js'
import { CaseNode } from '../operation-node/case-node.js'
import { WhenNode } from '../operation-node/when-node.js'
import { parseValueBinaryOperationOrExpression } from '../parser/binary-operation-parser.js'
import {
  isSafeImmediateValue,
  parseSafeImmediateValue,
  parseValueExpression,
} from '../parser/value-parser.js'
export class CaseBuilder {
  #props
  constructor(props) {
    this.#props = freeze(props)
  }
  when(...args) {
    return new CaseThenBuilder({
      ...this.#props,
      node: CaseNode.cloneWithWhen(
        this.#props.node,
        WhenNode.create(parseValueBinaryOperationOrExpression(args))
      ),
    })
  }
}
export class CaseThenBuilder {
  #props
  constructor(props) {
    this.#props = freeze(props)
  }
  then(valueExpression) {
    return new CaseWhenBuilder({
      ...this.#props,
      node: CaseNode.cloneWithThen(
        this.#props.node,
        isSafeImmediateValue(valueExpression)
          ? parseSafeImmediateValue(valueExpression)
          : parseValueExpression(valueExpression)
      ),
    })
  }
}
export class CaseWhenBuilder {
  #props
  constructor(props) {
    this.#props = freeze(props)
  }
  when(...args) {
    return new CaseThenBuilder({
      ...this.#props,
      node: CaseNode.cloneWithWhen(
        this.#props.node,
        WhenNode.create(parseValueBinaryOperationOrExpression(args))
      ),
    })
  }
  else(valueExpression) {
    return new CaseEndBuilder({
      ...this.#props,
      node: CaseNode.cloneWith(this.#props.node, {
        else: isSafeImmediateValue(valueExpression)
          ? parseSafeImmediateValue(valueExpression)
          : parseValueExpression(valueExpression),
      }),
    })
  }
  end() {
    return new ExpressionWrapper(
      CaseNode.cloneWith(this.#props.node, { isStatement: false })
    )
  }
  endCase() {
    return new ExpressionWrapper(
      CaseNode.cloneWith(this.#props.node, { isStatement: true })
    )
  }
}
export class CaseEndBuilder {
  #props
  constructor(props) {
    this.#props = freeze(props)
  }
  end() {
    return new ExpressionWrapper(
      CaseNode.cloneWith(this.#props.node, { isStatement: false })
    )
  }
  endCase() {
    return new ExpressionWrapper(
      CaseNode.cloneWith(this.#props.node, { isStatement: true })
    )
  }
}
