// Server component: pre-highlighted code ships as HTML strings via
// dangerouslySetInnerHTML, the way shiki-based docs pipelines do; the
// interactive frame (copy, tabs) is a client component.
import CodeBlockFrame from './code-block-frame'

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function toHtml(lines) {
  return (
    '<pre><code>' +
    lines
      .map(
        (line) =>
          '<span class="code-line">' +
          line
            .map(
              (tok) =>
                '<span class="tok tok-' +
                tok.t +
                '">' +
                escapeHtml(tok.s) +
                '</span>'
            )
            .join('') +
          '\n</span>'
      )
      .join('') +
    '</code></pre>'
  )
}

function Tokens({ lines }) {
  return <div dangerouslySetInnerHTML={{ __html: toHtml(lines) }} />
}

export default function ServerCodeBlock({ lines, lang, filename }) {
  const text = lines.map((l) => l.map((t) => t.s).join('')).join('\n')
  return (
    <CodeBlockFrame lang={lang} filename={filename} text={text}>
      <Tokens lines={lines} />
    </CodeBlockFrame>
  )
}

export function PackageManagerBlock({ variants }) {
  // variants: [{label, lines}] — npm/pnpm/yarn/bun tabs like real docs.
  return (
    <CodeBlockFrame
      lang="bash"
      tabs={variants.map((v) => v.label)}
      text={variants.map((v) =>
        v.lines.map((l) => l.map((t) => t.s).join('')).join('\n')
      )}
    >
      {variants.map((v) => (
        <Tokens key={v.label} lines={v.lines} />
      ))}
    </CodeBlockFrame>
  )
}
