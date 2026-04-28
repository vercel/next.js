/**
 * ESLint rule: error-subclass-static-name
 *
 * Requires every named class whose superclass identifier ends with `Error`
 * to declare `static name = '<ClassName>'`. Without this, SWC's class
 * minification renames the constructor and logged error instances appear
 * with a mangled name instead of the original class name.
 */

/**
 * @type {import('eslint').Rule.RuleModule}
 */
const plugin = {
  name: 'error-subclass-static-name',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a `static name` declaration on classes extending an Error so the class name survives SWC minification in logs.',
      recommended: true,
    },
    fixable: 'code',
    schema: [],
    messages: {
      missingStaticName:
        '`{{className}}` extends an Error but is missing `static name = "{{className}}"`. ' +
        'This is required so the class name survives SWC minification in logs.',
      mismatchedName:
        '`static name` on `{{className}}` should equal "{{className}}" so the original ' +
        'class name is preserved in logs after SWC minification.',
    },
  },

  create(context) {
    function checkClass(node) {
      if (!node.id || !node.superClass) {
        return
      }
      if (
        node.superClass.type !== 'Identifier' ||
        !node.superClass.name.endsWith('Error')
      ) {
        return
      }

      const className = node.id.name
      const existing = node.body.body.find(
        (member) =>
          member.type === 'PropertyDefinition' &&
          member.static === true &&
          member.computed === false &&
          member.key &&
          member.key.type === 'Identifier' &&
          member.key.name === 'name'
      )

      if (existing) {
        const init = existing.value
        if (
          init &&
          init.type === 'Literal' &&
          typeof init.value === 'string' &&
          init.value === className
        ) {
          return
        }

        context.report({
          node: existing,
          messageId: 'mismatchedName',
          data: { className },
          fix(fixer) {
            if (init) {
              return fixer.replaceText(init, `'${className}'`)
            }
            // No initializer at all: rewrite the whole property.
            return fixer.replaceText(
              existing,
              `static name = '${className}'`
            )
          },
        })
        return
      }

      context.report({
        node: node.id,
        messageId: 'missingStaticName',
        data: { className },
        fix(fixer) {
          const openBrace = node.body.range[0]
          return fixer.insertTextAfterRange(
            [openBrace, openBrace + 1],
            `\n  static name = '${className}'\n`
          )
        },
      })
    }

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    }
  },
}

module.exports = plugin
