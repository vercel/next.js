/// <reference types="./raw-builder.d.ts" />
import { AliasNode } from '../operation-node/alias-node.js'
import { freeze } from '../util/object-utils.js'
import { NOOP_QUERY_EXECUTOR } from '../query-executor/noop-query-executor.js'
import { IdentifierNode } from '../operation-node/identifier-node.js'
import { isOperationNodeSource } from '../operation-node/operation-node-source.js'
class RawBuilderImpl {
  #props
  constructor(props) {
    this.#props = freeze(props)
  }
  get expressionType() {
    return undefined
  }
  get isRawBuilder() {
    return true
  }
  as(alias) {
    return new AliasedRawBuilderImpl(this, alias)
  }
  $castTo() {
    return new RawBuilderImpl({ ...this.#props })
  }
  $notNull() {
    return new RawBuilderImpl(this.#props)
  }
  withPlugin(plugin) {
    return new RawBuilderImpl({
      ...this.#props,
      plugins:
        this.#props.plugins !== undefined
          ? freeze([...this.#props.plugins, plugin])
          : freeze([plugin]),
    })
  }
  toOperationNode() {
    return this.#toOperationNode(this.#getExecutor())
  }
  compile(executorProvider) {
    return this.#compile(this.#getExecutor(executorProvider))
  }
  async execute(executorProvider) {
    const executor = this.#getExecutor(executorProvider)
    return executor.executeQuery(this.#compile(executor), this.#props.queryId)
  }
  #getExecutor(executorProvider) {
    const executor =
      executorProvider !== undefined
        ? executorProvider.getExecutor()
        : NOOP_QUERY_EXECUTOR
    return this.#props.plugins !== undefined
      ? executor.withPlugins(this.#props.plugins)
      : executor
  }
  #toOperationNode(executor) {
    return executor.transformQuery(this.#props.rawNode, this.#props.queryId)
  }
  #compile(executor) {
    return executor.compileQuery(
      this.#toOperationNode(executor),
      this.#props.queryId
    )
  }
}
export function createRawBuilder(props) {
  return new RawBuilderImpl(props)
}
class AliasedRawBuilderImpl {
  #rawBuilder
  #alias
  constructor(rawBuilder, alias) {
    this.#rawBuilder = rawBuilder
    this.#alias = alias
  }
  get expression() {
    return this.#rawBuilder
  }
  get alias() {
    return this.#alias
  }
  get rawBuilder() {
    return this.#rawBuilder
  }
  toOperationNode() {
    return AliasNode.create(
      this.#rawBuilder.toOperationNode(),
      isOperationNodeSource(this.#alias)
        ? this.#alias.toOperationNode()
        : IdentifierNode.create(this.#alias)
    )
  }
}
