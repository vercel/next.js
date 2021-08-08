const { builtinModules } = require('module')
const {
  isReactClassComponent,
  isReactFunctionalComponent,
} = require('../utils/reactComponents.js')

const MODULES_TO_IGNORE = ['console']
const NODE_BUILD_IN_MODULES = builtinModules.filter(
  (el) => !el.startsWith('_') && !MODULES_TO_IGNORE.includes(el)
)

const walkUpToFindParentReactComponent = (context) => {
  let scope = context.getScope()
  while (scope) {
    const node = scope.block

    if (node.type === 'Program') {
      return null
    }

    if (isReactClassComponent(node) || isReactFunctionalComponent(node)) {
      return node
    }

    scope = scope.upper
  }
  return null
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow using Node.js built in modules in client side code.',
      recommended: true,
    },
    messages: {
      doNotCall: `Do not use {{name}} inside the react component.`,
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
    // if is a file in the API folder then return
    const isFileInApiFolder = context.getFilename().includes('pages/api')
    if (isFileInApiFolder) {
      return {}
    }

    const options = context.options[0] || {}
    const forbiddenImports = options.forbiddenImports
      ? new Set([...options.forbiddenImports, ...NODE_BUILD_IN_MODULES])
      : new Set([...NODE_BUILD_IN_MODULES])

    // forbidden import specifiers
    // like: import { foo } from ...
    // like: import bar from ...
    // the process module can be used without import statement
    let forbiddenImportSpecifiers = ['process']

    return {
      // to handle imports
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
      // to handle require statements
      CallExpression(node) {
        const { callee, parent } = node
        const isRequire =
          callee && callee.type === 'Identifier' && callee.name === 'require'
        const hasVariables = !!(parent && parent.id)
        const hasModuleName =
          node.arguments &&
          node.arguments.length >= 1 &&
          (node.arguments[0].type === 'Literal' ||
            node.arguments[0].type === 'StringLiteral')
        if (isRequire && hasVariables && hasModuleName) {
          // like: const fs = require('fs')
          const moduleName = node.arguments[0].value
          if (
            parent.id.type === 'Identifier' &&
            forbiddenImports.has(moduleName)
          ) {
            forbiddenImportSpecifiers = [
              ...forbiddenImportSpecifiers,
              parent.id.name,
            ]
          }
          // like: const {spawn, exec} = require('child_process')
          if (
            parent.id.type === 'ObjectPattern' &&
            forbiddenImports.has(moduleName)
          ) {
            const objectPropertyNames = parent.id.properties.map(
              (objectProperty) => objectProperty.value.name
            )
            forbiddenImportSpecifiers = [
              ...forbiddenImportSpecifiers,
              ...objectPropertyNames,
            ]
          }
        }
      },
      Identifier(node) {
        const isParentMemberExpression =
          node.parent && node.parent.type === 'MemberExpression'
        const isProcessEnv =
          isParentMemberExpression &&
          node.parent.object.name === 'process' &&
          node.parent.property.name === 'env'
        const isProcessBrowser =
          isParentMemberExpression &&
          node.parent.object.name === 'process' &&
          node.parent.property.name === 'browser'
        if (isProcessEnv || isProcessBrowser) {
          return
        }

        let fullName = node.name
        // like: foo.BAR
        if (isParentMemberExpression) {
          fullName = `${node.parent.object.name}.${node.parent.property.name}`
        }
        // like: foo()
        if (node.parent && node.parent.type === 'CallExpression') {
          fullName = node.name
        }

        // if the node name is not on the forbidden list
        if (
          !forbiddenImportSpecifiers.includes(node.name) ||
          (isParentMemberExpression &&
            !forbiddenImportSpecifiers.includes(node.parent.object.name))
        ) {
          return
        }

        // find the closest parent component
        const reactComponent = walkUpToFindParentReactComponent(context)
        if (reactComponent) {
          context.report({
            node,
            messageId: 'doNotCall',
            data: {
              name: fullName,
            },
          })
        }
      },
    }
  },
}
