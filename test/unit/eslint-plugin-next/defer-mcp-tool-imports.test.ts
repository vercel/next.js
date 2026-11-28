import { RuleTester } from 'eslint'
import * as tsParser from '@typescript-eslint/parser'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['defer-mcp-tool-imports']

const url = 'https://nextjs.org/docs/messages/defer-mcp-tool-imports'
const preservationNote =
  'Preserve import attributes, live bindings, and initialization order.'
const functionMessage = (
  names: string,
  verb: string,
  target: string,
  source: string,
  isAsync = true
) =>
  isAsync
    ? `${names} ${verb} only used inside ${target}. Import it there with \`await import(${JSON.stringify(source)})\` so it loads when that function runs, not on every cold start of the MCP route. ${preservationNote} See: ${url}`
    : `${names} ${verb} only used inside ${target}. Make ${target} async, update its callers, and import it there with \`await import(${JSON.stringify(source)})\` so it loads when that function runs, not on every cold start of the MCP route. ${preservationNote} See: ${url}`
const deferMessage = (names: string, verb: string, source: string) =>
  functionMessage(names, verb, '`execute()`', source)
const makeAsyncMessage = (names: string, verb: string, source: string) =>
  functionMessage(names, verb, '`execute()`', source, false)
const setupMessage = (
  names: string,
  verb: string,
  setup: string,
  defaults = ''
) =>
  `${names} ${verb} only needed by \`execute()\`, but this import is connected to module-level setup ${setup}, which is evaluated during cold starts. If setup invokes helpers or reads this dependency, move ${setup} into a shared module and load that module with \`await import()\` when the tool is called, or create and cache it lazily on the first call. If setup only stores helpers, lazy-load the dependency inside those helpers instead. Do not leave eager helper calls at module scope.${defaults ? ` Move parameter-default computations in ${defaults} into the function bodies, preserving when defaults apply. Make the affected functions async and update their callers.` : ''} ${preservationNote} See: ${url}`
const helperMessage = (
  names: string,
  verb: string,
  helper: string,
  source: string
) => functionMessage(names, verb, `\`${helper}()\``, source)
const makeHelperAsyncMessage = (
  names: string,
  verb: string,
  helper: string,
  source: string
) => functionMessage(names, verb, `\`${helper}()\``, source, false)
const multiMessage = (
  names: string,
  verb: string,
  list: string,
  source: string
) =>
  `${names} ${verb} only used by ${list}. Load the module with \`await import(${JSON.stringify(source)})\` in those functions or in a shared, lazily loaded module, not during every cold start. Make affected functions async and update their callers. ${preservationNote} See: ${url}`
const parameterMessage = (target: string) =>
  `\`db\` is imported eagerly and used in parameter defaults of ${target}. Move those default-value computations into the function bodies before using \`await import("@/lib/db")\`. Preserve when defaults apply; make the affected functions async and update their callers. ${preservationNote} See: ${url}`
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
          suggestions: [],
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
          suggestions: [],
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
          suggestions: [],
        },
      ],
    },
    // A sync execute gets guidance to update the function and its callers.
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
    // A tool defined through a module-level const.
    {
      code: `import { defineTool } from '@next/mcp/tools'
import { z } from 'zod'
import { db } from '@/lib/db'
const tool = defineTool({ description: 'x', inputSchema: z.object({}), async execute() { return db.ping() } })
export default tool`,
      errors: [
        { message: deferMessage('`db`', 'is', '@/lib/db'), suggestions: [] },
      ],
    },
    // eve tool files are recognized too.
    {
      code: `import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { db } from '@/lib/db'
export default defineTool({ description: 'x', inputSchema: z.object({}), async execute() { return db.ping() } })`,
      errors: [
        { message: deferMessage('`db`', 'is', '@/lib/db'), suggestions: [] },
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
          suggestions: [],
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
          suggestions: [],
        },
      ],
    },
    // A sync helper gets guidance to update the function and its callers.
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
    // Compact syntax and module paths containing quotes need no source rewrite.
    {
      code: `${header}import { db } from "./what's-db"
${tool('async execute() { return db }')}`,
      errors: [
        { message: deferMessage('`db`', 'is', "./what's-db"), suggestions: [] },
      ],
    },
    // Mutable exports must remain live; the warning never destructures them.
    {
      code: `${header}import { count, increment } from './counter'
${tool('async execute() { increment(); return count }')}`,
      errors: [
        {
          message: deferMessage('`count`, `increment`', 'are', './counter'),
          suggestions: [],
        },
      ],
    },
    {
      code: `${header}import { db } from '@/lib/db'
${tool('async execute(input = db.defaults) { return input }')}`,
      errors: [{ message: parameterMessage('`execute()`'), suggestions: [] }],
    },
    {
      code: `${header}import { db } from '@/lib/db'
async function load(input = db.defaults) { return input }
${tool('async execute() { return load() }')}`,
      errors: [{ message: parameterMessage('`load()`'), suggestions: [] }],
    },
    // Helpers reached through eager setup must not be described as deferred.
    {
      code: `${header}import { db } from '@/lib/db'
async function load() { return db.ping() }
function initialize() { return load() }
const cached = initialize()
${tool('async execute() { return cached }')}`,
      errors: [
        { message: setupMessage('`db`', 'is', '`cached`'), suggestions: [] },
      ],
    },
    // Eager setup and parameter defaults both need actionable guidance.
    {
      code: `${header}import { db } from '@/lib/db'
async function load(input = db.defaults) { return input }
const cached = load()
${tool('async execute() { return cached }')}`,
      errors: [
        {
          message: setupMessage('`db`', 'is', '`cached`', '`load()`'),
          suggestions: [],
        },
      ],
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
        { message: deferMessage('`db`', 'is', '@/lib/db'), suggestions: [] },
      ],
    },
    {
      code: `${header}import { db } from '@/lib/db'
const tool = defineTool({ description: 'x', inputSchema: z.object({}), async execute() { return db.x() } } as const) as unknown
export default tool!`,
      errors: [
        { message: deferMessage('`db`', 'is', '@/lib/db'), suggestions: [] },
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
          suggestions: [],
        },
      ],
    },
    // Import attributes remain the author's responsibility, not a lossy rewrite.
    {
      code: `${header}import data from './data.json' with { type: 'json' }
${tool('async execute() { return data }')}`,
      errors: [
        {
          message: deferMessage('`data`', 'is', './data.json'),
          suggestions: [],
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
