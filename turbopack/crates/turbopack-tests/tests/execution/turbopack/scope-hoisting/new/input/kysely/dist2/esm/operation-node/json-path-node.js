/// <reference types="./json-path-node.d.ts" />
import { freeze } from '../util/object-utils.js'
/**
 * @internal
 */
export const JSONPathNode = freeze({
  is(node) {
    return node.kind === 'JSONPathNode'
  },
  create(inOperator) {
    return freeze({
      kind: 'JSONPathNode',
      inOperator,
      pathLegs: freeze([]),
    })
  },
  cloneWithLeg(jsonPathNode, pathLeg) {
    return freeze({
      ...jsonPathNode,
      pathLegs: freeze([...jsonPathNode.pathLegs, pathLeg]),
    })
  },
})
