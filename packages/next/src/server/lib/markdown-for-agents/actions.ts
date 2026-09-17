export type AgentActionField = {
  name: string
  type?: string
  required?: boolean
  description?: string
}

export type AgentAction = {
  /** Stable id agents can quote (form name or data-agent-action). */
  id: string
  summary: string
  method: 'GET' | 'POST'
  /** Absolute or same-origin path. Defaults to the page URL. */
  href?: string
  contentType?: 'application/x-www-form-urlencoded' | 'multipart/form-data'
  fields: AgentActionField[]
}

const FORM_RE = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi
const INPUT_RE = /<(input|textarea|select)\b([^>]*)(?:\/>|>([\s\S]*?)<\/\1>)?/gi

function attr(source: string, name: string): string | undefined {
  const re = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i'
  )
  const m = source.match(re)
  return m?.[1] ?? m?.[2] ?? m?.[3]
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function inferActionsFromHtml(
  html: string,
  pageUrl: string
): AgentAction[] {
  const actions: AgentAction[] = []
  FORM_RE.lastIndex = 0
  let form: RegExpExecArray | null
  while ((form = FORM_RE.exec(html))) {
    const formAttrs = form[1]
    const formBody = form[2]
    const method = (attr(formAttrs, 'method') || 'POST').toUpperCase()
    const href = attr(formAttrs, 'action') || pageUrl
    const id =
      attr(formAttrs, 'data-agent-action') ||
      attr(formAttrs, 'name') ||
      attr(formAttrs, 'id') ||
      slug(attr(formAttrs, 'aria-label') || href || 'action')
    const summary =
      attr(formAttrs, 'data-agent-summary') ||
      attr(formAttrs, 'aria-label') ||
      `Submit the ${id} form`
    const enc = (attr(formAttrs, 'enctype') || '').toLowerCase()
    const fields: AgentActionField[] = []
    INPUT_RE.lastIndex = 0
    let input: RegExpExecArray | null
    while ((input = INPUT_RE.exec(formBody))) {
      const attrs = input[2]
      const type = (attr(attrs, 'type') || input[1] || 'text').toLowerCase()
      if (
        type === 'hidden' ||
        type === 'submit' ||
        type === 'button' ||
        type === 'reset'
      ) {
        continue
      }
      const name = attr(attrs, 'name')
      if (!name) continue
      fields.push({
        name,
        type,
        required: /\srequired(\s|=|>|$)/i.test(attrs),
        description: attr(attrs, 'aria-label') || attr(attrs, 'placeholder'),
      })
    }
    actions.push({
      id: slug(id) || `action-${actions.length + 1}`,
      summary,
      method: method === 'GET' ? 'GET' : 'POST',
      href,
      contentType:
        enc === 'multipart/form-data'
          ? 'multipart/form-data'
          : 'application/x-www-form-urlencoded',
      fields,
    })
  }
  return actions
}

function encodeExample(fields: AgentActionField[]): string {
  return fields
    .map((field) => {
      const sample =
        field.type === 'email'
          ? 'ada@example.com'
          : field.type === 'number'
            ? '1'
            : field.name
      return `${encodeURIComponent(field.name)}=${encodeURIComponent(sample)}`
    })
    .join('&')
}

export function renderActionsMarkdown(
  actions: AgentAction[],
  pageUrl: string
): string {
  if (!actions.length) return ''
  const yamlLines = ['actions:']
  for (const action of actions) {
    yamlLines.push(`  - id: ${JSON.stringify(action.id)}`)
    yamlLines.push(`    method: ${action.method}`)
    yamlLines.push(`    href: ${JSON.stringify(action.href || pageUrl)}`)
    yamlLines.push(
      `    contentType: ${JSON.stringify(action.contentType || 'application/x-www-form-urlencoded')}`
    )
    yamlLines.push(`    summary: ${JSON.stringify(action.summary)}`)
    yamlLines.push('    fields:')
    if (!action.fields.length) {
      yamlLines.push('      []')
    }
    for (const field of action.fields) {
      yamlLines.push(`      - name: ${JSON.stringify(field.name)}`)
      if (field.type)
        yamlLines.push(`        type: ${JSON.stringify(field.type)}`)
      if (field.required) yamlLines.push('        required: true')
      if (field.description) {
        yamlLines.push(
          `        description: ${JSON.stringify(field.description)}`
        )
      }
    }
  }

  const sections = [
    '## Actions',
    '',
    'POST (or GET) the **same URL as this page**. Send cookies when the action needs a session. Auth and CSRF rules on the HTML form still apply.',
    '',
    '```yaml',
    yamlLines.join('\n'),
    '```',
    '',
  ]

  for (const action of actions) {
    const href = action.href || pageUrl
    const contentType =
      action.contentType || 'application/x-www-form-urlencoded'
    const body = encodeExample(action.fields)
    sections.push(`### \`${action.id}\``)
    sections.push('')
    sections.push(action.summary)
    sections.push('')
    sections.push('```http')
    sections.push(`${action.method} ${href}`)
    sections.push(`Content-Type: ${contentType}`)
    if (body && action.method !== 'GET') {
      sections.push('')
      sections.push(body)
    }
    sections.push('```')
    sections.push('')
    if (action.fields.length) {
      sections.push('| Field | Type | Required |')
      sections.push('| --- | --- | --- |')
      for (const field of action.fields) {
        sections.push(
          `| \`${field.name}\` | ${field.type || 'text'} | ${field.required ? 'yes' : 'no'} |`
        )
      }
      sections.push('')
    }
  }

  return sections.join('\n').trim()
}
