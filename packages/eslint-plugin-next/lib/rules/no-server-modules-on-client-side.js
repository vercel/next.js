const { builtinModules } = require('module')

const MODULES_TO_IGNORE = ['console']
const NODE_BUILD_IN_MODULES = builtinModules.filter(
  (el) => !el.startsWith('_') && !MODULES_TO_IGNORE.includes(el)
)
// TODO: if defined in these methods then do not report
const DATA_FETCHING_FUNCTION_NAMES = [
  'getStaticProps',
  'getStaticPaths',
  'getServerSideProps',
]
const REACT_COMPONENT_TYPES = ['PureComponent', 'Component']
const REACT_WRAPPER_FUNCTIONS = ['forwardRef', 'memo']
const JSX_ELEMENTS = ['JSXElement', 'JSXFragment']

const isJSX = (node) => node && JSX_ELEMENTS.includes(node.type)

const isFirstLetterUpperCase = (str) => {
  if (!str) {
    return false
  }
  const firstLetter = str.charAt(0)
  return firstLetter.toUpperCase() === firstLetter
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

const isReturningJSXOrNull = (node) => {
  if (!node || !node.body || node.body.type !== 'BlockStatement') {
    return false
  }

  const block = node.body
  const statements = block.body
  const returnStatement = statements.find((el) => el.type === 'ReturnStatement')
  console.log({
    returnStatement,
  })
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
  // or: return <></>
  return (
    returnStatement.argument.type === 'NullLiteral' ||
    (returnStatement.argument.type === 'Literal' &&
      returnStatement.argument.value === null) ||
    isJSX(returnStatement.argument)
  )
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

  console.log({
    isFunctionDeclarationComponent,
    isFunctionExpressionComponent,
    isArrowFunctionExpressionComponent,
  })

  if (
    isFunctionDeclarationComponent ||
    isFunctionExpressionComponent ||
    isArrowFunctionExpressionComponent
  ) {
    return isReturningJSXOrNull(node)
  }

  console.log({
    node,
  })

  const isFunctionNode =
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  const isParentCallExpressionNode =
    node.parent && node.parent.type === 'CallExpression'
  const callee = node.parent && node.parent.callee
  const isCalleOneOfReactWrappers =
    callee &&
    callee.type === 'MemberExpression' &&
    callee.object.name === 'React' &&
    REACT_WRAPPER_FUNCTIONS.includes(callee.property.name)
  const isReactWrappedComponent =
    isFunctionNode && isParentCallExpressionNode && isCalleOneOfReactWrappers

  console.log({
    isReactWrappedComponent,
    isFunctionNode,
    isParentCallExpressionNode,
    isCalleOneOfReactWrappers,
  })
  if (isReactWrappedComponent) {
    return isReturningJSXOrNull(node)
  }

  return false
}

const walkUpToFindParentComponent = (context) => {
  let scope = context.getScope()
  while (scope) {
    const node = scope.block
    console.log({ scope })
    console.log(node.type)
    console.log(isReactClassComponent(node))
    if (isReactClassComponent(node) || isReactFunctionalComponent(node)) {
      return node
    }

    if (node.type === 'Program') {
      return null
    }

    scope = scope.upper
  }
  return null
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: '',
      recommended: true,
    },
    schema: [
      {
        type: 'object',
        properties: {
          forbiddenImports: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'string',
            },
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create: function (context) {
    const filename = context.getFilename()
    // if is a file in the API folder then return
    const isFileInApiFolder = filename.includes('pages/api')
    if (isFileInApiFolder) {
      return {}
    }

    const options = context.options[0] || {}
    const forbiddenImports = options.forbiddenImports
      ? new Set([...options.forbiddenImports, ...NODE_BUILD_IN_MODULES])
      : new Set([...NODE_BUILD_IN_MODULES])

    // forbidden import specifiers like: import { foo } from ...
    // import bar from ...
    let forbiddenImportSpecifiers = []

    return {
      ImportDeclaration(node) {
        if (forbiddenImports.has(node.source.value)) {
          const importSpecifierNames = node.specifiers.map(
            (importSpecifier) => importSpecifier.local.name
          )
          forbiddenImportSpecifiers = [
            ...forbiddenImportSpecifiers,
            ...importSpecifierNames,
          ]
        }
      },
      CallExpression(node) {
        if (!forbiddenImportSpecifiers.length) {
          return
        }

        const { callee } = node
        let calleName
        // like: bar()
        if (callee.type === 'Identifier') {
          // bar
          calleName = callee.name
        }

        // like: foo.bar()
        if (callee.type === 'MemberExpression') {
          // foo
          calleName = callee.object.name
        }

        // if the calle name is not on the forbidden list
        if (!forbiddenImportSpecifiers.includes(calleName)) {
          return
        }

        // find the closest parent component
        const reactComponent = walkUpToFindParentComponent(context)
        if (reactComponent) {
          context.report({
            node,
            message: `Do not call ${calleName} from the react component.`,
          })
        }
      },
    }
  },
}
