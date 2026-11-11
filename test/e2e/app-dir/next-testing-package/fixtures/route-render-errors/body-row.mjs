export function flight(body, format) {
  if (format === 'flight') return body
  let result = ''
  const prefix = 'self.__next_f.push('
  let position = 0
  for (;;) {
    let start = body.indexOf(prefix, position)
    if (start < 0) break
    start += prefix.length
    let quoted = false,
      escaped = false,
      depth = 0,
      end = start
    for (; end < body.length; end++) {
      const c = body[end]
      if (quoted) {
        if (escaped) escaped = false
        else if (c === '\\') escaped = true
        else if (c === '"') quoted = false
      } else if (c === '"') quoted = true
      else if (c === '[') depth++
      else if (c === ']' && --depth === 0) {
        end++
        break
      }
    }
    position = end
    try {
      const row = JSON.parse(body.slice(start, end))
      if (row[0] === 1) result += row[1]
    } catch {}
  }
  return result
}
export function bodyRow(response, format) {
  const text = flight(response.body, format)
  return {
    status: response.status,
    contentType: response.headers['content-type'] ?? null,
    location: response.headers.location ?? null,
    htmlErrorDocument: response.body.includes('id="__next_error__"'),
    rootLayout: response.body.includes(
      format === 'html'
        ? 'data-root-layout="acme"'
        : '"data-root-layout":"acme"'
    ),
    nestedLayout: response.body.includes(
      format === 'html'
        ? 'data-nested-layout="acme"'
        : '"data-nested-layout":"acme"'
    ),
    nestedErrorLayout: response.body.includes(
      format === 'html'
        ? 'data-error-nested-layout="nested"'
        : '"data-error-nested-layout":"nested"'
    ),
    provider: response.body.includes(
      format === 'html' ? 'data-provider-context="acme"' : '"label":"acme"'
    ),
    renderedRootErrorBoundary: response.body.includes(
      'data-render-error-boundary="root"'
    ),
    renderedNestedErrorBoundary: response.body.includes(
      'data-render-error-boundary="nested"'
    ),
    errorRecords: text.split('\n').flatMap((line) => {
      const match = line.match(/^([a-f0-9]+):E(.*)$/)
      if (!match) return []
      try {
        return [{ id: match[1], ...JSON.parse(match[2]) }]
      } catch {
        return [{ id: match[1], raw: match[2] }]
      }
    }),
    clientReferences: text.split('\n').flatMap((line) => {
      const match = line.match(/^([a-f0-9]+):I(.*)$/)
      if (!match) return []
      try {
        return [{ id: match[1], reference: JSON.parse(match[2]) }]
      } catch {
        return [{ id: match[1], raw: match[2] }]
      }
    }),
    templateErrors: [...response.body.matchAll(/<template\b([^>]*)>/g)].map(
      (match) => match[1]
    ),
  }
}
