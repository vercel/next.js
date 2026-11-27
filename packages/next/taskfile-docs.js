// Turns a docs page written for nextjs.org (MDX) into the Markdown that ships
// in `dist/docs`. The website resolves these constructs when it renders a
// page; a reader of the bundled file sees them as text, so they are resolved
// here instead:
//
// - `<AppOnly>` / `<PagesOnly>`: only the content for the file's own router.
// - Pages that share another page's content (`source:` in the frontmatter):
//   the shared content, resolved for the router of the file that points at it.
// - Paired TypeScript and JavaScript samples: the TypeScript one.
// - `<Image>`: a Markdown image with its alt text.
// - Website-only layout (`<FixCardGrid>`, `<FixCard>`, a styled callout
//   `<div>`, MDX comments): the text they carry, without the markup.
//
// Code blocks are never changed, apart from the fence line of a paired sample.

const FENCE = /^(\s*)(`{3,}|~{3,})(.*)$/
const ROUTER_OPEN = /^\s*<(AppOnly|PagesOnly)>\s*$/
const ROUTER_CLOSE = /^\s*<\/(AppOnly|PagesOnly)>\s*$/
const KEPT_BY_ROUTER = { app: 'AppOnly', pages: 'PagesOnly' }

/**
 * A line of prose with the router tags inside a sentence resolved:
 * "Edit the <AppOnly>`app/page.tsx`</AppOnly><PagesOnly>`pages/index.tsx`</PagesOnly> file".
 * Text in inline code is kept as written, so a page can still name the tags.
 * `state.dropping` carries a tag left open at the end of a line into the next.
 */
function resolveInline(line, router, state) {
  if (!state.dropping && !/<\/?(?:AppOnly|PagesOnly)>/.test(line)) return line
  let out = ''
  // Inline code spans, then everything between them.
  for (const part of line.split(/(`+[^`]*`+)/)) {
    if (/^`/.test(part)) {
      if (!state.dropping) out += part
      continue
    }
    let rest = part
    for (let match; (match = rest.match(/<(\/?)(AppOnly|PagesOnly)>/)); ) {
      if (!state.dropping) out += rest.slice(0, match.index)
      rest = rest.slice(match.index + match[0].length)
      if (match[1]) {
        if (state.dropping === match[2]) state.dropping = null
      } else if (
        !state.dropping &&
        router &&
        KEPT_BY_ROUTER[router] !== match[2]
      ) {
        state.dropping = match[2]
      }
    }
    if (!state.dropping) out += rest
  }
  return out
}

/** The website's tick and cross icons as characters, wherever they sit in a line (mostly table cells). */
function resolveIcons(line) {
  if (!/<(?:Check|Cross)\b/.test(line)) return line
  return line
    .split(/(`+[^`]*`+)/)
    .map((part) =>
      /^`/.test(part)
        ? part
        : part
            .replace(/<Check\b[^>]*\/>/g, '✓')
            .replace(/<Cross\b[^>]*\/>/g, '✗')
    )
    .join('')
}

/** The router a bundled file belongs to, from its path under the docs root. */
function routerOf(relativePath) {
  const top = relativePath.split(/[/\\]/)[0]
  if (/^(\d+-)?app$/.test(top)) return 'app'
  if (/^(\d+-)?pages$/.test(top)) return 'pages'
  return null
}

/** `---` frontmatter and what follows it. */
function splitFrontmatter(source) {
  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return match
    ? { frontmatter: match[0], body: source.slice(match[0].length) }
    : { frontmatter: '', body: source }
}

/** The page a file takes its content from: `source: app/guides/forms`. */
function sourceOf(frontmatter) {
  const match = frontmatter.match(/^source:\s*["']?([^"'\s]+)["']?\s*$/m)
  return match ? match[1] : null
}

/** A quoted JSX attribute's value, or null. */
function attribute(block, name) {
  const match = block.match(
    new RegExp(
      `\\b${name}=(?:"([^"]*)"|'([^']*)'|\\{\\s*["'\`]([^"'\`]*)["'\`]\\s*\\})`
    )
  )
  return match ? (match[1] ?? match[2] ?? match[3]) : null
}

/**
 * A `<FixCard>` the way nextjs.org renders it as Markdown: its group and its
 * title linked to its section, then its lines of code.
 */
function fixCard(block, indent) {
  const title = attribute(block, 'title')
  const href = attribute(block, 'href')
  const group = attribute(block, 'group')
  const snippets = []
  const text = /text:\s*(['"`])((?:\\.|(?!\1).)*)\1/g
  for (let match; (match = text.exec(block)); ) {
    snippets.push(match[2].replace(/\\(['"`\\])/g, '$1'))
  }
  if (!title) return []
  const label = group ? `${group[0].toUpperCase()}${group.slice(1)}: ` : ''
  const lines = [`${indent}${label}${href ? `[${title}](${href})` : title}`, '']
  if (snippets.length) {
    lines.push(`${indent}\`\`\``)
    for (const snippet of snippets) lines.push(`${indent}${snippet}`)
    lines.push(`${indent}\`\`\``, '')
  }
  return lines
}

/** A `<Video>` as a link to it, labelled with its caption. */
function video(block, indent) {
  const src = attribute(block, 'src')
  const caption = attribute(block, 'caption')
  return src && caption ? [`${indent}[${caption}](${src})`] : []
}

/** An `<Image>` as a Markdown image, with the path the page was written with. */
function image(block, indent) {
  const alt = attribute(block, 'alt') ?? ''
  const src = attribute(block, 'srcLight') ?? attribute(block, 'src')
  if (src) return [`${indent}![${alt}](${src})`]
  return alt ? [`${indent}_${alt}_`] : []
}

/** Lines `from..` up to and including the first one that ends the JSX tag. */
function tagBlock(lines, from, ends) {
  let to = from
  while (to < lines.length - 1 && !ends.test(lines[to])) to++
  return { block: lines.slice(from, to + 1).join('\n'), to }
}

/**
 * The body of a page as Markdown. `router` is `'app'`, `'pages'` or `null`
 * (a page that belongs to neither keeps both routers' content).
 */
function convertBody(body, router) {
  const lines = body.split(/\r?\n/)
  const out = []
  let fence = null
  // A TypeScript sample of a pair was just written: its JavaScript twin follows.
  let afterTypeScriptSample = false
  let skippingFence = false
  // Router blocks being dropped, and styled <div>s whose closing tag goes too.
  let dropping = 0
  let styledDivs = 0
  const inline = { dropping: null }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const fenceLine = raw.match(FENCE)

    if (fence) {
      const closes =
        fenceLine &&
        fenceLine[2][0] === fence.marker[0] &&
        fenceLine[2].length >= fence.marker.length &&
        fenceLine[3].trim() === ''
      if (!skippingFence && dropping === 0) out.push(raw)
      if (closes) {
        fence = null
        skippingFence = false
      }
      continue
    }

    if (ROUTER_OPEN.test(raw)) {
      const name = raw.match(ROUTER_OPEN)[1]
      if (dropping > 0 || (router && KEPT_BY_ROUTER[router] !== name))
        dropping++
      continue
    }
    if (ROUTER_CLOSE.test(raw)) {
      if (dropping > 0) dropping--
      continue
    }

    if (fenceLine) {
      fence = { marker: fenceLine[2] }
      const info = fenceLine[3]
      const paired = /(^|\s)switcher(\s|$)/.test(info)
      const language = info.trim().split(/\s+/)[0] ?? ''
      if (paired && afterTypeScriptSample && /^jsx?$/.test(language)) {
        // The JavaScript twin of the sample above: left out, with the blank line before it.
        skippingFence = true
        afterTypeScriptSample = false
        if (dropping === 0 && out.at(-1) === '') out.pop()
        continue
      }
      afterTypeScriptSample = paired && /^tsx?$/.test(language)
      if (dropping === 0) {
        out.push(
          paired
            ? `${fenceLine[1]}${fenceLine[2]}${info.replace(/\s+switcher(?=\s|$)/, '')}`
            : raw
        )
      }
      continue
    }

    if (dropping > 0) continue

    // Router tags inside a sentence. A line they leave empty goes with them.
    const resolved = resolveInline(lines[i], router, inline)
    if (resolved !== lines[i]) {
      if (resolved.trim() === '') continue
      // A dropped tag can leave a doubled space or one before punctuation; indentation is kept.
      const lead = resolved.match(/^\s*/)[0]
      lines[i] =
        lead +
        resolved
          .slice(lead.length)
          .replace(/ {2,}/g, ' ')
          .replace(/ +([.,;:])/g, '$1')
    }
    const line = resolveIcons(lines[i])
    if (line.trim() !== '') afterTypeScriptSample = false

    const indent = line.match(/^\s*/)[0]
    const trimmed = line.trim()

    // MDX comments are notes to docs authors.
    if (/^\{\/\*.*\*\/\}$/.test(trimmed)) continue
    if (trimmed.startsWith('{/*')) {
      while (i < lines.length - 1 && !lines[i].includes('*/}')) i++
      continue
    }

    if (/^<\/?FixCardGrid\b[^>]*>$/.test(trimmed)) continue
    if (/^<FixCard\b/.test(trimmed)) {
      const { block, to } = tagBlock(lines, i, /\/>\s*$/)
      i = to
      // Cards are indented under their grid; as list items they start the line.
      out.push(...fixCard(block, indent.replace(/^ {1,2}/, '')))
      continue
    }
    if (/^<Video\b/.test(trimmed)) {
      const { block, to } = tagBlock(lines, i, /\/>\s*$/)
      i = to
      out.push(...video(block, indent))
      continue
    }
    if (/^<Image\b/.test(trimmed)) {
      const { block, to } = tagBlock(lines, i, /\/>\s*$/)
      i = to
      out.push(...image(block, indent))
      continue
    }
    // A callout box drawn with an inline style: keep what is inside it.
    if (/^<div\b/.test(trimmed)) {
      const { block, to } = tagBlock(lines, i, />\s*$/)
      if (/\bstyle=\{\{/.test(block)) {
        i = to
        styledDivs++
        continue
      }
    }
    if (trimmed === '</div>' && styledDivs > 0) {
      styledDivs--
      continue
    }

    // Text inside a removed callout was indented under its <div>.
    out.push(styledDivs > 0 ? line.replace(/^ {1,2}/, '') : line)
  }

  // Dropped blocks can leave runs of blank lines behind.
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

/**
 * A docs page as the Markdown that ships in the package.
 *
 * `relativePath` is the file's path under the docs root (`01-app/…`). For a
 * page that shares another page's content, `readSource(path)` returns that
 * page's MDX (`path` as written in the frontmatter, `app/guides/forms`), or
 * null when it cannot be found.
 */
function toMarkdown(source, { relativePath = '', readSource } = {}) {
  const router = routerOf(relativePath)
  const { frontmatter, body } = splitFrontmatter(source)
  const shared = sourceOf(frontmatter)
  if (shared && readSource) {
    const sharedSource = readSource(shared)
    if (sharedSource != null) {
      return (
        frontmatter + convertBody(splitFrontmatter(sharedSource).body, router)
      )
    }
  }
  return frontmatter + convertBody(body, router)
}

/** `01-app/02-guides/forms.mdx` as the path pages refer to it by: `app/guides/forms`. */
function docsPath(relativePath) {
  return relativePath
    .replace(/\.mdx?$/, '')
    .split(/[/\\]/)
    .map((part) => part.replace(/^\d+-/, ''))
    .join('/')
}

module.exports = { toMarkdown, routerOf, docsPath }
