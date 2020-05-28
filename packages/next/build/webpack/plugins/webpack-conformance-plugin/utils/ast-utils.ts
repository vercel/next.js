// eslint-disable-next-line import/no-extraneous-dependencies
import { namedTypes } from 'ast-types'
import { types } from 'next/dist/compiled/recast'

export function isNodeCreatingScriptElement(node: namedTypes.CallExpression) {
  const callee = node.callee as namedTypes.Identifier
  if (callee.type !== 'Identifier') {
    return false
  }
  const componentNode = node.arguments[0] as namedTypes.Literal
  if (componentNode.type !== 'Literal') {
    return false
  }
  // Next has pragma: __jsx.
  return callee.name === '__jsx' && componentNode.value === 'script'
}

export function reducePropsToObject(
  propsNode: types.namedTypes.ObjectExpression
) {
  return propsNode.properties.reduce((originalProps, prop: any) => {
    // @ts-ignore
    originalProps[prop.key.name] = prop.value.value
    return originalProps
  }, {})
}
