/**
 * ESLint rule: typechecked-require
 * Ensures every require(source) call is cast to typeof import(source)
 * Source: https://v0.dev/chat/eslint-cast-imports-CDvQ3iWC1Mo
 */

module.exports = {
  name: 'typechecked-require',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce require() calls to be cast as typeof import(). ' +
        'Rule can be disabled for require(cjs) or for files not distributed in next/dist/esm.',
      category: 'TypeScript',
      recommended: true,
    },
    fixable: 'code',
    schema: [],
    messages: {
      missingCast: '`require(source)` must be cast as `typeof import(source)`',
      mismatchedSource:
        'Source in `require(source)` must match source in `import(source)`.\n' +
        'Require: "{{requireSource}}"\n' +
        ' Import: "{{importSource}}"',
    },
  },

  create(context) {
    function checkRequireCall(node) {
      // Check if this is a require() call
      if (
        node.type !== 'CallExpression' ||
        node.callee.type !== 'Identifier' ||
        node.callee.name !== 'require' ||
        node.arguments.length !== 1 ||
        !(
          node.arguments[0].type === 'Literal' ||
          node.arguments[0].type === 'TemplateLiteral'
        )
      ) {
        return
      }

      let requireSource
      if (node.arguments[0].type === 'TemplateLiteral') {
        if (node.arguments[0].quasis.length === 1) {
          requireSource = node.arguments[0].quasis[0].value.cooked
        } else {
          // Ignore template literals with placeholders
          return
        }
      } else {
        requireSource = node.arguments[0].value
      }
      const parent = node.parent

      // json is fine because we have resolveJsonModule disabled in our TS project
      if (requireSource.endsWith('.json')) {
        return
      }

      // Check if the require is wrapped in a TypeScript assertion
      if (parent && parent.type === 'TSAsExpression') {
        const typeAnnotation = parent.typeAnnotation

        // Check if it's a typeof import() expression
        if (
          typeAnnotation.type === 'TSTypeQuery' &&
          typeAnnotation.exprName.type === 'TSImportType'
        ) {
          const importType = typeAnnotation.exprName

          // Check if the import source matches the require source
          if (
            importType.argument &&
            importType.argument.type === 'TSLiteralType' &&
            importType.argument.literal.type === 'Literal'
          ) {
            const importSource = importType.argument.literal.value

            if (requireSource !== importSource) {
              context.report({
                node,
                messageId: 'mismatchedSource',
                data: {
                  requireSource,
                  importSource,
                },
                fix(fixer) {
                  // importSource as source of truth since that's what's typechecked
                  // and will be changed by automated refactors.
                  const newCast = `(require('${importSource}') as typeof import('${importSource}'))`
                  return fixer.replaceText(parent, newCast)
                },
              })
            }
          }
        } else {
          // Has assertion but not the correct type
          context.report({
            node: parent,
            messageId: 'missingCast',
            fix(fixer) {
              const newCast = `(require('${requireSource}') as typeof import('${requireSource}'))`
              return fixer.replaceText(parent, newCast)
            },
          })
        }
      } else {
        // No TypeScript assertion at all
        context.report({
          node,
          messageId: 'missingCast',
          fix(fixer) {
            const newCast = `(require('${requireSource}') as typeof import('${requireSource}'))`
            return fixer.replaceText(node, newCast)
          },
        })
      }
    }

    return {
      CallExpression: checkRequireCall,
    }
  },
}
