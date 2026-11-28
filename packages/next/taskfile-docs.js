// Turns a docs page written for nextjs.org (MDX) into the Markdown that ships
// in `dist/docs`. The website resolves these constructs when it renders a
// page; a reader of the bundled file sees them as text, so they are resolved
// here instead:
//
// - `<AppOnly>` / `<PagesOnly>`: only the content for the file's own router.
// - Pages that share another page's content (`source:` in the frontmatter):
//   the shared content, resolved for the router of the file that points at it.
// - Paired TypeScript and JavaScript samples: the TypeScript one.
// - `<Image>` and `<Video>`: a Markdown image or link.
// - Website-only layout (`<FixCardGrid>`, `<FixCard>`, `<Check>`, `<Cross>`,
//   a styled wrapper `<div>`, an empty anchor `<span>`, MDX comments): the
//   text they carry.
// - A section page with no body, which the website fills with its child
//   pages: a list of links to them.
//
// The page is parsed as MDX and the tree is used for positions only: each
// construct is cut out of, or replaced in, the original text. Matching these by
// pattern goes wrong per shape (a tag inside a sentence, inside a table cell,
// nested, or written `</PagesOnly >`), and re-serializing the tree would
// reformat every table and list. This is the approach nextjs.org's own
// Markdown output takes. Code blocks are never changed, apart from the fence
// line of a paired sample.

const KEPT_BY_ROUTER = { app: 'AppOnly', pages: 'PagesOnly' }
const ROUTER_TAGS = new Set(['AppOnly', 'PagesOnly'])

/** The router a bundled file belongs to, from its path under the docs root. */
function routerOf(relativePath) {
  const top = relativePath.split(/[/\\]/)[0]
  if (/^(\d+-)?app$/.test(top)) return 'app'
  if (/^(\d+-)?pages$/.test(top)) return 'pages'
  return null
}

/** `01-app/02-guides/forms.mdx` as the path pages refer to it by: `app/guides/forms`. */
function docsPath(relativePath) {
  return relativePath
    .replace(/\.mdx?$/, '')
    .split(/[/\\]/)
    .map((part) => part.replace(/^\d+-/, ''))
    .join('/')
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

const isJsx = (node) =>
  node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement'

/** A JSX attribute's value when it is a plain string, or null. */
function attribute(node, name) {
  const found = (node.attributes ?? []).find(
    (entry) => entry.type === 'mdxJsxAttribute' && entry.name === name
  )
  return found && typeof found.value === 'string' ? found.value : null
}

/** The source of a JSX attribute written as an expression: `snippets={[…]}`. */
function expression(node, name) {
  const found = (node.attributes ?? []).find(
    (entry) => entry.type === 'mdxJsxAttribute' && entry.name === name
  )
  return found && found.value && typeof found.value === 'object'
    ? found.value.value
    : null
}

/**
 * A `<FixCard>` the way nextjs.org renders it as Markdown: its group and its
 * title linked to its section, then its lines of code.
 */
function fixCard(node) {
  const title = attribute(node, 'title')
  const href = attribute(node, 'href')
  const group = attribute(node, 'group')
  if (!title) return ''
  const snippets = []
  const text = /text:\s*(['"`])((?:\\.|(?!\1).)*)\1/g
  const source = expression(node, 'snippets') ?? ''
  for (let match; (match = text.exec(source)); ) {
    snippets.push(match[2].replace(/\\(['"`\\])/g, '$1'))
  }
  const label = group ? `${group[0].toUpperCase()}${group.slice(1)}: ` : ''
  const lines = [`${label}${href ? `[${title}](${href})` : title}`]
  if (snippets.length) lines.push('', '```', ...snippets, '```')
  return lines.join('\n')
}

// Docs images and videos are written as root-relative paths (`/docs/light/…`)
// that only the website's own components resolve. This is where nextjs.org
// serves them from, and what its Markdown output points at.
const MEDIA_BASE = 'https://h8DxKfmAPhn8O0p3.public.blob.vercel-storage.com'

/** A root-relative media path as a URL that opens; anything else as written. */
const media = (src) =>
  src.startsWith('/') && !src.startsWith('//') ? MEDIA_BASE + src : src

/** An `<Image>` as a Markdown image that opens, with its alt text. */
function image(node) {
  const alt = attribute(node, 'alt') ?? ''
  const src = attribute(node, 'srcLight') ?? attribute(node, 'src')
  if (src) return `![${alt}](${media(src)})`
  return alt ? `_${alt}_` : ''
}

/** A `<Video>` as a link to it, labelled with its caption. */
function video(node) {
  const src = attribute(node, 'src')
  const caption = attribute(node, 'caption')
  return src && caption ? `[${caption}](${media(src)})` : ''
}

/** A note to docs authors, written as an MDX comment. */
const isComment = (node) =>
  (node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression') &&
  /^\s*\/\*[\s\S]*\*\/\s*$/.test(node.value ?? '')

const isPaired = (node) =>
  node?.type === 'code' && /(^|\s)switcher(\s|$)/.test(node.meta ?? '')

/** A value from a page's frontmatter, when it is written on one line. */
function field(frontmatter, name) {
  const match = frontmatter.match(new RegExp(`^${name}:[ \\t]*(.*)$`, 'm'))
  const value = match ? match[1].trim().replace(/^(["'])(.*)\1$/, '$2') : ''
  return /^[>|][+-]?$/.test(value) ? '' : value
}

/**
 * The pages directly under a section page (`…/index.mdx`), in the order they
 * sit on disk, as `{ title, description, href }`. `files` is every docs file's
 * path under the docs root, and `read(file)` returns its source. Empty for a
 * file that is not a section page.
 */
function childPages(relativePath, files, read) {
  const parts = relativePath.split(/[/\\]/)
  if (!/^index\.mdx?$/.test(parts.pop())) return []
  const depth = parts.length
  const inSection = (file) => {
    const other = file.split(/[/\\]/)
    if (!parts.every((part, i) => other[i] === part)) return false
    const rest = other.slice(depth)
    return rest.length === 1
      ? !/^index\.mdx?$/.test(rest[0]) && /\.mdx?$/.test(rest[0])
      : rest.length === 2 && /^index\.mdx?$/.test(rest[1])
  }
  return files
    .filter(inSection)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .map((file) => {
      const { frontmatter } = splitFrontmatter(read(file) ?? '')
      return {
        title: field(frontmatter, 'title'),
        description: field(frontmatter, 'description'),
        href: `/docs/${docsPath(file).replace(/\/index$/, '')}`,
      }
    })
    .filter((page) => page.title)
}

/** Child pages as nextjs.org lists them in a section page's Markdown. */
const childList = (children) =>
  children
    .map(
      ({ title, description, href }) =>
        `- [${title}](${href})${description ? `: ${description}` : ''}`
    )
    .join('\n')

/**
 * The body of a page as Markdown. `router` is `'app'`, `'pages'` or `null`
 * (a page that belongs to neither keeps both routers' content).
 */
function convertBody(parse, body, router) {
  const tree = parse(body)
  // Cuts and replacements against `body`, by offset. They never overlap: a
  // removed node is not walked into.
  const edits = []
  const start = (node) => node.position.start.offset
  const end = (node) => node.position.end.offset
  const lineStart = (offset) => body.lastIndexOf('\n', offset - 1) + 1
  // From the start of the node's line, when only indentation comes before it.
  const fromLine = (node) => {
    const at = lineStart(start(node))
    return /^[ \t]*$/.test(body.slice(at, start(node))) ? at : start(node)
  }

  /** Remove a block and the blank line after it. */
  const removeFlow = (node) => {
    let to = end(node)
    for (let taken = 0; taken < 2 && body[to] === '\n'; taken++) to++
    edits.push({ start: fromLine(node), end: to, text: '' })
  }
  /** Remove something inside a sentence, without leaving a doubled space or one before punctuation. */
  const removeText = (node) => {
    let from = start(node)
    const to = end(node)
    const after = body[to]
    if (
      body[from - 1] === ' ' &&
      (after === undefined || /[ \n.,;:)]/.test(after))
    ) {
      from--
    }
    edits.push({ start: from, end: to, text: '' })
  }
  /** Keep what is inside a tag and drop the tag itself. */
  const unwrap = (node) => {
    const children = node.children ?? []
    if (children.length === 0) {
      if (node.type === 'mdxJsxFlowElement') removeFlow(node)
      else removeText(node)
      return
    }
    const first = start(children[0])
    const last = end(children.at(-1))
    if (node.type === 'mdxJsxFlowElement') {
      // The opening tag's lines, up to the line the content starts on.
      const contentLine = lineStart(first)
      edits.push({
        start: fromLine(node),
        end: contentLine > start(node) ? contentLine : first,
        text: '',
      })
      // From the end of the content's last line through the closing tag's line.
      let to = end(node)
      if (body[to] === '\n') to++
      edits.push({
        start: body[last] === '\n' ? last + 1 : last,
        end: to,
        text: '',
      })
    } else {
      edits.push({ start: start(node), end: first, text: '' })
      edits.push({ start: last, end: end(node), text: '' })
    }
  }
  /** Replace a block with Markdown, at the start of its line. */
  const replaceFlow = (node, text) => {
    if (text === '') removeFlow(node)
    else edits.push({ start: fromLine(node), end: end(node), text })
  }
  const replace = (node, text) => {
    if (node.type === 'mdxJsxFlowElement') replaceFlow(node, text)
    else edits.push({ start: start(node), end: end(node), text })
  }
  /** Text that was indented under a wrapper loses that indentation with it. */
  const dedent = (from, to) => {
    for (
      let at = body.indexOf('\n', from);
      at !== -1 && at < to;
      at = body.indexOf('\n', at + 1)
    ) {
      const indent = body.slice(at + 1, at + 3).match(/^ {1,2}/)
      if (indent) {
        edits.push({ start: at + 1, end: at + 1 + indent[0].length, text: '' })
      }
    }
  }

  // TypeScript samples whose JavaScript twin has been dropped.
  const taken = new Set()
  const walk = (parent) => {
    const children = parent.children ?? []
    for (let i = 0; i < children.length; i++) {
      const node = children[i]

      if (isComment(node)) {
        if (node.type === 'mdxFlowExpression') removeFlow(node)
        else removeText(node)
        continue
      }

      if (node.type === 'code') {
        if (!isPaired(node)) continue
        if (/^jsx?$/.test(node.lang ?? '')) {
          // The TypeScript sample this one repeats: the nearest one in the
          // samples directly above that has no twin yet. Pairs are usually
          // written ts, js; some pages write ts, ts, js, js.
          let twin = null
          for (let j = i - 1; j >= 0 && isPaired(children[j]); j--) {
            const above = children[j]
            if (/^tsx?$/.test(above.lang ?? '') && !taken.has(above)) {
              twin = above
              break
            }
          }
          if (twin) {
            taken.add(twin)
            // With the blank line before it.
            edits.push({
              start: end(children[i - 1]),
              end: end(node),
              text: '',
            })
            continue
          }
        }
        // Only the fence line changes: the code is untouched.
        const lineEnd = body.indexOf('\n', start(node))
        const fence = body.slice(
          start(node),
          lineEnd === -1 ? end(node) : lineEnd
        )
        edits.push({
          start: start(node),
          end: start(node) + fence.length,
          text: fence.replace(/\s+switcher(?=\s|$)/, ''),
        })
        continue
      }

      if (!isJsx(node)) {
        walk(node)
        continue
      }

      if (ROUTER_TAGS.has(node.name)) {
        if (router && KEPT_BY_ROUTER[router] !== node.name) {
          if (node.type === 'mdxJsxFlowElement') removeFlow(node)
          else removeText(node)
        } else {
          unwrap(node)
          walk(node)
        }
        continue
      }
      if (node.name === 'FixCardGrid') {
        // Its cards are indented under it; as Markdown they start the line.
        const cards = (node.children ?? [])
          .filter((child) => child.name === 'FixCard')
          .map(fixCard)
          .filter(Boolean)
        replaceFlow(node, cards.join('\n\n'))
        continue
      }
      if (node.name === 'FixCard') {
        replace(node, fixCard(node))
        continue
      }
      if (node.name === 'Image') {
        replace(node, image(node))
        continue
      }
      if (node.name === 'Video') {
        replace(node, video(node))
        continue
      }
      if (node.name === 'Check' || node.name === 'Cross') {
        replace(node, node.name === 'Check' ? '✓' : '✗')
        continue
      }
      // An anchor the website keeps for old links: nothing to read.
      if (
        node.name === 'span' &&
        (node.children ?? []).length === 0 &&
        (node.attributes ?? []).every((entry) => entry.name === 'id')
      ) {
        if (node.type === 'mdxJsxFlowElement') removeFlow(node)
        else removeText(node)
        continue
      }
      // A wrapper that only carries inline CSS: keep what is inside it.
      if (
        node.type === 'mdxJsxFlowElement' &&
        node.name === 'div' &&
        (node.attributes ?? []).length > 0 &&
        node.attributes.every((entry) => entry.name === 'style')
      ) {
        unwrap(node)
        if (node.children?.length) {
          dedent(
            lineStart(start(node.children[0])) - 1,
            end(node.children.at(-1))
          )
        }
        walk(node)
        continue
      }
      walk(node)
    }
  }
  walk(tree)

  let out = body
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  }
  return out
}

/**
 * Loads the MDX parser and returns `toMarkdown(source, options)`: a docs page
 * as the Markdown that ships in the package.
 *
 * `relativePath` is the file's path under the docs root (`01-app/…`). For a
 * page that shares another page's content, `readSource(path)` returns that
 * page's MDX (`path` as written in the frontmatter, `app/guides/forms`), or
 * null when it cannot be found. `children` are the pages under a section page
 * (see `childPages`), listed when the page has no body of its own.
 */
async function createConverter() {
  // ESM-only packages, used at build time and never shipped.
  const [{ unified }, { default: remarkParse }, { default: remarkMdx }] =
    await Promise.all([
      import('unified'),
      import('remark-parse'),
      import('remark-mdx'),
    ])
  const parser = unified().use(remarkParse).use(remarkMdx)
  const parse = (body) => parser.parse(body)

  return function toMarkdown(
    source,
    { relativePath = '', readSource, children = [] } = {}
  ) {
    const router = routerOf(relativePath)
    const { frontmatter, body } = splitFrontmatter(source)
    const shared = sourceOf(frontmatter)
    const sharedSource = shared && readSource ? readSource(shared) : null
    const converted = convertBody(
      parse,
      sharedSource != null ? splitFrontmatter(sharedSource).body : body,
      router
    )
    if (converted.trim() === '' && children.length) {
      return `${frontmatter}\n${childList(children)}\n`
    }
    return frontmatter + converted
  }
}

module.exports = { createConverter, childPages, routerOf, docsPath }
