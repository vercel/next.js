const JSX_ELEMENTS = ['JSXElement', 'JSXFragment']
const REACT_COMPONENT_TYPES = ['PureComponent', 'Component']
const REACT_WRAPPER_FUNCTIONS = ['forwardRef', 'memo']

const isFirstLetterUpperCase = (str) => {
  if (!str) {
    return false
  }
  const firstLetter = str.charAt(0)
  return firstLetter.toUpperCase() === firstLetter
}

const isJSX = (node) => node && JSX_ELEMENTS.includes(node.type)

const isReturningJSXOrValidElement = (node) => {
  if (!node || !node.body || node.body.type !== 'BlockStatement') {
    return false
  }

  const block = node.body
  const statements = block.body
  const returnStatement = statements.find((el) => el.type === 'ReturnStatement')

  // like: return () => {}
  if (
    !returnStatement ||
    !returnStatement.argument ||
    [
      'ArrowFunctionExpression',
      'FunctionExpression',
      'FunctionDeclaration',
    ].includes(returnStatement.argument.type)
  ) {
    return false
  }

  // like: return [<></>]
  if (
    returnStatement.argument.type === 'ArrayExpression' &&
    returnStatement.argument.elements &&
    returnStatement.argument.elements.length
  ) {
    return returnStatement.argument.elements.some(isJSX)
  }

  // like: return something ? <></> : <></>
  if (returnStatement.argument.type === 'ConditionalExpression') {
    return (
      isJSX(returnStatement.argument.consequent) ||
      isJSX(returnStatement.argument.alternate)
    )
  }

  // like: return foo && <></>
  if (returnStatement.argument.type === 'LogicalExpression') {
    return (
      isJSX(returnStatement.argument.left) ||
      isJSX(returnStatement.argument.right)
    )
  }

  // like: return null
  // or: return 123
  // or: return '123'
  // or: return <></>
  const isLiteralReactValidValue =
    returnStatement.argument.type === 'Literal' &&
    (returnStatement.argument.value === null ||
      typeof returnStatement.argument.value === 'string' ||
      typeof returnStatement.argument.value === 'number')
  return (
    returnStatement.argument.type === 'NullLiteral' ||
    isLiteralReactValidValue ||
    isJSX(returnStatement.argument)
  )
}

const isReactClassComponent = (node) => {
  const { superClass } = node
  if (!superClass) {
    return false
  }

  const classComponentRegExp = new RegExp(
    `^(React\\.)?(PureComponent|Component)?$`
  )
  if (superClass.name) {
    return classComponentRegExp.test(superClass.name)
  }

  if (
    superClass.type === 'MemberExpression' &&
    superClass.object.name === 'React' &&
    REACT_COMPONENT_TYPES.includes(superClass.property.name)
  ) {
    return true
  }

  return false
}

const isReactFunctionalComponent = (node) => {
  const isFunctionDeclarationComponent =
    node.type === 'FunctionDeclaration' &&
    node.id &&
    isFirstLetterUpperCase(node.id.name)

  const isFunctionExpressionComponent =
    node.type === 'FunctionExpression' &&
    node.parent &&
    node.parent.type === 'VariableDeclarator' &&
    isFirstLetterUpperCase(node.parent.id.name)

  const isArrowFunctionExpressionComponent =
    node.type === 'ArrowFunctionExpression' &&
    node.parent &&
    node.parent.type === 'VariableDeclarator' &&
    isFirstLetterUpperCase(node.parent.id.name)

  if (
    isFunctionDeclarationComponent ||
    isFunctionExpressionComponent ||
    isArrowFunctionExpressionComponent
  ) {
    return isReturningJSXOrValidElement(node)
  }

  const isFunctionNode =
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'

  const isParentCallExpressionNode =
    node.parent && node.parent.type === 'CallExpression'

  const callee = node.parent && node.parent.callee

  const isCalleMemberExpression =
    callee &&
    callee.type === 'MemberExpression' &&
    callee.object.name === 'React' &&
    REACT_WRAPPER_FUNCTIONS.includes(callee.property.name)

  const isCalleIdentifier =
    callee &&
    callee.type === 'Identifier' &&
    REACT_WRAPPER_FUNCTIONS.includes(callee.name)

  const isCalleOneOfReactWrappers = isCalleMemberExpression || isCalleIdentifier

  const isReactWrappedComponent =
    isFunctionNode && isParentCallExpressionNode && isCalleOneOfReactWrappers

  if (isReactWrappedComponent) {
    return isReturningJSXOrValidElement(node)
  }

  return false
}

module.exports = {
  isJSX,
  isReturningJSXOrValidElement,
  isReactClassComponent,
  isReactFunctionalComponent,
}
