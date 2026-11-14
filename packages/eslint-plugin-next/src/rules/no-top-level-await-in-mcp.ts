import type { Rule } from 'eslint'
import { defineRule } from '../utils/define-rule'
import {
  findToolDefinition,
  insideFunction,
  localNamesFor,
  ROUTE_MODULE,
} from '../utils/mcp'

const url = 'https://nextjs.org/docs/messages/no-top-level-await-in-mcp'

export default defineRule({
  meta: {
    docs: {
      description:
        'Prevent top-level `await` in `@next/mcp` tool and route modules, which delays every cold start of the MCP route.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create(context) {
    let kind: 'tool' | 'route' | undefined

    const report = (node: Rule.Node) => {
      if (!kind || insideFunction(node)) return
      const where =
        kind === 'tool'
          ? '`execute()`'
          : 'the auth function or tool that needs it'
      context.report({
        node,
        message: `Top-level \`await\` in an MCP ${kind} module runs on every cold start of the MCP route and during \`next build\`. Move it into ${where}, or cache it lazily on first use. See: ${url}`,
      })
    }

    return {
      Program(program) {
        if (findToolDefinition(program)) {
          kind = 'tool'
        } else if (
          localNamesFor(program, new Set([ROUTE_MODULE]), 'mcpRoute').size > 0
        ) {
          kind = 'route'
        }
      },
      AwaitExpression: report,
      'ForOfStatement[await=true]': report,
    }
  },
})
