import { RuleTester } from 'eslint'
import * as tsParser from '@typescript-eslint/parser'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['defer-mcp-tool-imports']

const url = 'https://nextjs.org/docs/messages/defer-mcp-tool-imports'
const deferMessage = (names: string, verb: string, source: string) =>
  `${names} ${verb} only used inside \`execute()\`. Import it there with \`await import('${source}')\` so it loads when the tool is called, not on every cold start of the MCP route. See: ${url}`
const makeAsyncMessage = (names: string, verb: string, source: string) =>
  `${names} ${verb} only used inside \`execute()\`. Make \`execute()\` async and import it there with \`await import('${source}')\` so it loads when the tool is called, not on every cold start of the MCP route. See: ${url}`
const setupMessage = (names: string, verb: string, setup: string) =>
  `${names} ${verb} only needed when \`execute()\` runs, through module-level ${setup}, which still runs on every cold start of the MCP route. Move ${setup} into a shared module and load that with \`await import()\` when the tool is called, or create it lazily on the first call. See: ${url}`
const helperMessage = (
  names: string,
  verb: string,
  helper: string,
  source: string
) =>
  `${names} ${verb} only used inside \`${helper}()\`, which only \`execute()\` calls. Import it there with \`await import('${source}')\` so it loads when the tool is called, not on every cold start of the MCP route. See: ${url}`
const makeHelperAsyncMessage = (
  names: string,
  verb: string,
  helper: string,
  source: string
) =>
  `${names} ${verb} only used inside \`${helper}()\`, which only \`execute()\` calls. Make \`${helper}()\` async and import it there with \`await import('${source}')\` so it loads when the tool is called, not on every cold start of the MCP route. See: ${url}`
const multiMessage = (
  names: string,
  verb: string,
  list: string,
  source: string
) =>
  `${names} ${verb} only used by ${list}, which only run when \`execute()\` is called. Import it where it is used with \`await import('${source}')\` so it loads when the tool is called, not on every cold start of the MCP route. See: ${url}`
const suggestion = (source: string, target = 'execute') =>
  `Move this import into \`${target}()\` as \`await import('${source}')\`.`
const tool = (execute: string) =>
  `export default defineTool({ description: 'x', inputSchema: z.object({}), ${execute} })`

const header = `import { defineTool } from '@next/mcp/tools'
import { z } from 'zod'
`

const tests = {
  valid: [
    // Already deferred.
    `${header}
export default defineTool({
  description: 'Ping the database',
  inputSchema: z.object({}),
  async execute() {
    const { db } = await import('@/lib/db')
    return db.ping()
  },
})`,
    // Used to build the schema, so it is needed at module load.
    `${header}import { eventShape } from '@/lib/schemas'
export default defineTool({
  description: 'Validate an event',
  inputSchema: eventShape,
  async execute(input) { return eventShape.parse(input) },
})`,
    // Used in the description.
    `${header}import { TOOL_TEXT } from '@/lib/copy'
export default defineTool({
  description: TOOL_TEXT,
  inputSchema: z.object({}),
  async execute() { return TOOL_TEXT },
})`,
    // Framework modules and Node.js builtins are cheap or already loaded.
    `${header}import { revalidatePath } from 'next/cache'
import { randomUUID } from 'node:crypto'
import { join } from 'path'
export default defineTool({
  description: 'New id',
  inputSchema: z.object({}),
  async execute() { revalidatePath(join('/', 'x')); return randomUUID() },
})`,
    // User allowlist.
    {
      code: `${header}import { db } from '@/lib/db'
export default defineTool({ description: 'x', inputSchema: z.object({}), async execute() { return db.ping() } })`,
      options: [{ allow: ['@/lib/*'] }],
    },
    // Side-effect imports may be intentional.
    `${header}import '@/lib/polyfill'
export default defineTool({ description: 'x', inputSchema: z.object({}), async execute() { return 1 } })`,
    // Not a tool file.
    `import { db } from '@/lib/db'
export async function run() { return db.ping() }`,
    // Also used outside execute.
    `${header}import { db } from '@/lib/db'
export const warm = () => db.ping()
export default defineTool({ description: 'x', inputSchema: z.object({}), async execute() { return db.ping() } })`,
    // Module-level setup that is also used outside execute.
    `${header}import { S3Client } from '@aws-sdk/client-s3'
const s3 = new S3Client({})
export const region = s3.config.region
export default defineTool({ description: 'x', inputSchema: z.object({}), async execute() { return s3 } })`,
    // Exported setup is not execute-only.
    `${header}import { S3Client } from '@aws-sdk/client-s3'
export const s3 = new S3Client({})
export default defineTool({ description: 'x', inputSchema: z.object({}), async execute() { return s3 } })`,
    // A helper also used outside execute (here, by the approval policy).
    `${header}import { db } from '@/lib/db'
function isOwner(id) { return db.owns(id) }
export default defineTool({
  description: 'x',
  inputSchema: z.object({}),
  approval: ({ toolInput }) => (isOwner(toolInput.id) ? 'approved' : 'denied'),
  async execute({ id }) { return isOwner(id) },
})`,
    // An exported helper may be imported eagerly elsewhere.
    `${header}import { db } from '@/lib/db'
export async function load(id) { return db.find(id) }
${tool('async execute({ id }) { return load(id) }')}`,
    // Mutually recursive helpers that execute never calls: unused code, not
    // this rule's concern.
    `${header}import { db } from '@/lib/db'
function a(n) { return n ? b(n - 1) : db.x() }
function b(n) { return a(n) }
${tool('async execute() { return 1 }')}`,
  ],
  invalid: [
    {
      code: `${header}import { db } from '@/lib/db'
export default defineTool({
  description: 'Ping the database',
  inputSchema: z.object({}),
  async execute() {
    return db.ping()
  },
})`,
      errors: [
        {
          message: deferMessage('`db`', 'is', '@/lib/db'),
          type: 'ImportDeclaration',
          suggestions: [
            {
              desc: suggestion('@/lib/db'),
              output: `${header}export default defineTool({
  description: 'Ping the database',
  inputSchema: z.object({}),
  async execute() {
    const { db } = await import('@/lib/db')
    return db.ping()
  },
})`,
            },
          ],
        },
      ],
    },
    {
      code: `${header}import Stripe, { errors as stripeErrors } from 'stripe'
export default defineTool({
  description: 'Charge',
  inputSchema: z.object({}),
  execute: async () => {
    const client = new Stripe('key')
    return stripeErrors ? client : null
  },
})`,
      errors: [
        {
          message: deferMessage('`Stripe`, `stripeErrors`', 'are', 'stripe'),
          suggestions: [
            {
              desc: suggestion('stripe'),
              output: `${header}export default defineTool({
  description: 'Charge',
  inputSchema: z.object({}),
  execute: async () => {
    const { default: Stripe, errors: stripeErrors } = await import('stripe')
    const client = new Stripe('key')
    return stripeErrors ? client : null
  },
})`,
            },
          ],
        },
      ],
    },
    {
      code: `${header}import * as aws from '@aws-sdk/client-s3'
export default defineTool({
  description: 'Client',
  inputSchema: z.object({}),
  async execute() {
    return new aws.S3Client({})
  },
})`,
      errors: [
        {
          message: deferMessage('`aws`', 'is', '@aws-sdk/client-s3'),
          suggestions: [
            {
              desc: suggestion('@aws-sdk/client-s3'),
              output: `${header}export default defineTool({
  description: 'Client',
  inputSchema: z.object({}),
  async execute() {
    const aws = await import('@aws-sdk/client-s3')
    return new aws.S3Client({})
  },
})`,
            },
          ],
        },
      ],
    },
    // A sync execute gets the message but no suggestion.
    {
      code: `${header}import { format } from 'date-fns'
export default defineTool({ description: 'Today', inputSchema: z.object({}), execute: () => format(new Date(), 'P') })`,
      errors: [
        {
          message: makeAsyncMessage('`format`', 'is', 'date-fns'),
          suggestions: [],
        },
      ],
    },
    // A client constructed at module scope only for execute.
    {
      code: `${header}import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
const s3 = new S3Client({})
export default defineTool({
  description: 'Upload',
  inputSchema: z.object({}),
  async execute() { return s3.send(new PutObjectCommand({})) },
})`,
      errors: [
        {
          message: setupMessage(
            '`S3Client`, `PutObjectCommand`',
            'are',
            '`s3`'
          ),
          suggestions: [],
        },
      ],
    },
    // Setup chained through several module-level constants.
    {
      code: `${header}import Stripe from 'stripe'
const key = process.env.STRIPE_KEY
const stripe = new Stripe(key)
const charges = stripe.charges
export default defineTool({ description: 'Charges', inputSchema: z.object({}), async execute() { return charges.list() } })`,
      errors: [
        {
          message: setupMessage('`Stripe`', 'is', '`stripe`'),
          suggestions: [],
        },
      ],
    },
    // Tool defined through a module-level const, imported from @next/mcp.
    {
      code: `import { defineTool } from '@next/mcp'
import { z } from 'zod'
import { db } from '@/lib/db'
const tool = defineTool({ description: 'x', inputSchema: z.object({}), async execute() { return db.ping() } })
export default tool`,
      errors: [
        { message: deferMessage('`db`', 'is', '@/lib/db'), suggestions: 1 },
      ],
    },
    // eve tool files are recognized too.
    {
      code: `import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { db } from '@/lib/db'
export default defineTool({ description: 'x', inputSchema: z.object({}), async execute() { return db.ping() } })`,
      errors: [
        { message: deferMessage('`db`', 'is', '@/lib/db'), suggestions: 1 },
      ],
    },
    // A function-declaration helper that only execute calls.
    {
      code: `${header}import { db } from '@/lib/db'
async function load(id) {
  return db.find(id)
}
${tool('async execute({ id }) { return load(id) }')}`,
      errors: [
        {
          message: helperMessage('`db`', 'is', 'load', '@/lib/db'),
          suggestions: [
            {
              desc: suggestion('@/lib/db', 'load'),
              output: `${header}async function load(id) {
  const { db } = await import('@/lib/db')
  return db.find(id)
}
${tool('async execute({ id }) { return load(id) }')}`,
            },
          ],
        },
      ],
    },
    // An arrow helper is a function, not module-level setup.
    {
      code: `${header}import { db } from '@/lib/db'
const run = async (ctx) => {
  return db.x(ctx)
}
${tool('execute: (_input, ctx) => run(ctx)')}`,
      errors: [
        {
          message: helperMessage('`db`', 'is', 'run', '@/lib/db'),
          suggestions: 1,
        },
      ],
    },
    // A sync helper gets the message but no suggestion.
    {
      code: `${header}import { format } from 'date-fns'
const today = () => format(new Date(), 'P')
${tool('async execute() { return today() }')}`,
      errors: [
        {
          message: makeHelperAsyncMessage(
            '`format`',
            'is',
            'today',
            'date-fns'
          ),
          suggestions: [],
        },
      ],
    },
    // Reached through a chain of helpers.
    {
      code: `${header}import { db } from '@/lib/db'
function outer() { return inner() }
function inner() { return db.x() }
${tool('async execute() { return outer() }')}`,
      errors: [
        { message: makeHelperAsyncMessage('`db`', 'is', 'inner', '@/lib/db') },
      ],
    },
    // Mutually recursive helpers reached from execute.
    {
      code: `${header}import { db } from '@/lib/db'
function a(n) { return n ? b(n - 1) : db.x() }
function b(n) { return a(n) }
${tool('async execute() { return a(3) }')}`,
      errors: [
        { message: makeHelperAsyncMessage('`db`', 'is', 'a', '@/lib/db') },
      ],
    },
    // Used in execute and in a helper: no single place to move it.
    {
      code: `${header}import { db } from '@/lib/db'
function load(id) { return db.find(id) }
${tool('async execute({ id }) { await db.ping(); return load(id) }')}`,
      errors: [
        {
          message: multiMessage(
            '`db`',
            'is',
            '`load()`, `execute()`',
            '@/lib/db'
          ),
          suggestions: [],
        },
      ],
    },
    // A helper that reads module-level setup still reports the setup.
    {
      code: `${header}import { S3Client } from '@aws-sdk/client-s3'
const s3 = new S3Client({})
async function upload() { return s3.send() }
${tool('async execute() { return upload() }')}`,
      errors: [{ message: setupMessage('`S3Client`', 'is', '`s3`') }],
    },
  ],
}

const typescriptTests = {
  valid: [
    // Type-only imports cost nothing at runtime.
    `${header}import type { Db } from '@/lib/db'
export default defineTool({ description: 'x', inputSchema: z.object({}), async execute(): Promise<Db | null> { return null } })`,
    // A value import that is also used as a type outside execute cannot move.
    `${header}import { Db } from '@/lib/db'
let cached: Db | undefined
export default defineTool({ description: 'x', inputSchema: z.object({}), async execute() { return new Db() } })`,
  ],
  invalid: [
    // `satisfies`, `as` and `!` around the default export, the module-level
    // tool, and the definition object are all recognized.
    {
      code: `${header}import { db } from '@/lib/db'
export default defineTool({ description: 'x', inputSchema: z.object({}), async execute() { return db.x() } }) satisfies unknown`,
      errors: [
        { message: deferMessage('`db`', 'is', '@/lib/db'), suggestions: 1 },
      ],
    },
    {
      code: `${header}import { db } from '@/lib/db'
const tool = defineTool({ description: 'x', inputSchema: z.object({}), async execute() { return db.x() } } as const) as unknown
export default tool!`,
      errors: [
        { message: deferMessage('`db`', 'is', '@/lib/db'), suggestions: 1 },
      ],
    },
    // A typed helper constant.
    {
      code: `${header}import { db } from '@/lib/db'
const load = (async (id: string) => { return db.find(id) }) satisfies (id: string) => unknown
${tool('async execute({ id }) { return load(id) }')}`,
      errors: [
        {
          message: helperMessage('`db`', 'is', 'load', '@/lib/db'),
          suggestions: 1,
        },
      ],
    },
  ],
}

describe('defer-mcp-tool-imports', () => {
  new RuleTester({
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  }).run('eslint', NextESLintRule, tests)

  new RuleTester({
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  }).run('typescript', NextESLintRule, typescriptTests)
})
