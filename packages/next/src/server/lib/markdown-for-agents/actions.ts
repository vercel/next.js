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
  /** Canonical page path (no `.md` / `.txt` suffix). */
  href?: string
  contentType?: 'application/x-www-form-urlencoded' | 'multipart/form-data'
  fields: AgentActionField[]
  /**
   * Current-deployment Server Action id from `$ACTION_ID_<hash>`.
   * Required for a progressive-enhancement POST to invoke the action.
   */
  actionId?: string
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

/** Strip `.md` / `.txt` so action examples always target the HTML page URL. */
export function canonicalPagePath(url: string): string {
  let path = (url.split('?')[0] || '/').replace(/\/+$/, '') || '/'
  if (path === '/index.md' || path === '/index.txt') return '/'
  if (path.endsWith('.mdx')) return path
  if (path.endsWith('.md') || path.endsWith('.txt')) {
    path = path.replace(/\.(md|txt)$/, '') || '/'
  }
  return path || '/'
}

function resolveHref(actionAttr: string | undefined, pageUrl: string): string {
  const canonical = canonicalPagePath(pageUrl)
  if (
    !actionAttr ||
    actionAttr === '#' ||
    /^javascript:/i.test(actionAttr) ||
    actionAttr.startsWith('blob:')
  ) {
    return canonical
  }
  return actionAttr
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
    const href = resolveHref(attr(formAttrs, 'action'), pageUrl)
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
    let actionId: string | undefined
    let hasFile = false
    INPUT_RE.lastIndex = 0
    let input: RegExpExecArray | null
    while ((input = INPUT_RE.exec(formBody))) {
      const attrs = input[2]
      const type = (attr(attrs, 'type') || input[1] || 'text').toLowerCase()
      const name = attr(attrs, 'name') || ''
      if (type === 'hidden' && name.startsWith('$ACTION_ID_')) {
        actionId = name.slice('$ACTION_ID_'.length)
        continue
      }
      if (
        type === 'hidden' ||
        type === 'submit' ||
        type === 'button' ||
        type === 'reset'
      ) {
        continue
      }
      if (!name) continue
      if (type === 'file') hasFile = true
      fields.push({
        name,
        type,
        required: /\srequired(\s|=|>|$)/i.test(attrs),
        description: attr(attrs, 'aria-label') || attr(attrs, 'placeholder'),
      })
    }
    const isServerAction = Boolean(actionId)
    actions.push({
      id: slug(id) || `action-${actions.length + 1}`,
      summary,
      method: method === 'GET' ? 'GET' : 'POST',
      href,
      contentType:
        isServerAction || hasFile || enc === 'multipart/form-data'
          ? 'multipart/form-data'
          : 'application/x-www-form-urlencoded',
      fields,
      actionId,
    })
  }
  return actions
}

function sampleValue(field: AgentActionField): string {
  if (field.type === 'email') return 'ada@example.com'
  if (field.type === 'number') return '1'
  return field.name
}

function encodeExample(fields: AgentActionField[]): string {
  return fields
    .map(
      (field) =>
        `${encodeURIComponent(field.name)}=${encodeURIComponent(sampleValue(field))}`
    )
    .join('&')
}

function multipartExample(action: AgentAction): string {
  const boundary = '----NextAgentForm'
  const parts: string[] = []
  if (action.actionId) {
    parts.push(
      `--${boundary}`,
      `Content-Disposition: form-data; name="$ACTION_ID_${action.actionId}"`,
      '',
      ''
    )
  }
  for (const field of action.fields) {
    parts.push(
      `--${boundary}`,
      `Content-Disposition: form-data; name="${field.name}"`,
      '',
      sampleValue(field)
    )
  }
  parts.push(`--${boundary}--`)
  return parts.join('\r\n')
}

function curlExample(action: AgentAction, href: string): string {
  const lines = [`curl -X ${action.method} '${href}'`]
  if (action.actionId) {
    lines[0] += ` \\`
    lines.push(`  -F '$ACTION_ID_${action.actionId}=' \\`)
    for (let i = 0; i < action.fields.length; i++) {
      const field = action.fields[i]
      const suffix = i === action.fields.length - 1 ? '' : ' \\'
      lines.push(`  -F '${field.name}=${sampleValue(field)}'${suffix}`)
    }
    if (!action.fields.length) {
      lines[lines.length - 1] = lines[lines.length - 1].replace(/ \\$/, '')
    }
  } else if (action.method !== 'GET' && action.fields.length) {
    lines[0] += ` \\`
    lines.push(`  -H 'Content-Type: application/x-www-form-urlencoded' \\`)
    lines.push(`  --data '${encodeExample(action.fields)}'`)
  } else if (action.method === 'GET' && action.fields.length) {
    return `curl '${href}?${encodeExample(action.fields)}'`
  }
  return lines.join('\n')
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
    if (action.actionId) {
      yamlLines.push(`    actionId: ${JSON.stringify(action.actionId)}`)
    }
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
    'Invoke these operations with HTTP on the **same URL as this page** (no extra path). Send cookies when a session is required. Auth and CSRF rules from the HTML form still apply.',
    '',
    'Server Actions must be `multipart/form-data` and include the `$ACTION_ID_…` field from the current HTML. Copy the `curl` example; the id is for this deployment.',
    '',
    '```yaml',
    yamlLines.join('\n'),
    '```',
    '',
  ]

  for (const action of actions) {
    const href = action.href || canonicalPagePath(pageUrl)
    const contentType =
      action.contentType || 'application/x-www-form-urlencoded'
    sections.push(`### \`${action.id}\``)
    sections.push('')
    sections.push(action.summary)
    sections.push('')
    sections.push('```bash')
    sections.push(curlExample(action, href))
    sections.push('```')
    sections.push('')
    sections.push('```http')
    if (action.method === 'GET' && action.fields.length) {
      sections.push(`GET ${href}?${encodeExample(action.fields)}`)
    } else {
      sections.push(`${action.method} ${href}`)
      if (contentType === 'multipart/form-data') {
        sections.push(
          'Content-Type: multipart/form-data; boundary=----NextAgentForm'
        )
        sections.push('')
        sections.push(multipartExample(action))
      } else {
        sections.push(`Content-Type: ${contentType}`)
        if (action.fields.length && action.method !== 'GET') {
          sections.push('')
          sections.push(encodeExample(action.fields))
        }
      }
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
