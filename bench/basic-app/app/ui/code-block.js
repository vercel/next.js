'use client'
import { useState } from 'react'
// Receives pre-tokenized lines: [[{t: 'kw', s: 'const'}, {t: 'pl', s: ' x'}], ...]
// like a syntax highlighter would emit; renders one span per token.
export default function CodeBlock({ lines, lang, filename }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="code-block" data-lang={lang}>
      {filename ? <div className="code-filename">{filename}</div> : null}
      <button
        type="button"
        className="code-copy"
        onClick={() => {
          navigator.clipboard?.writeText(
            lines.map((l) => l.map((t) => t.s).join('')).join('\n')
          )
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre>
        <code>
          {lines.map((line, i) => (
            <span key={i} className="code-line">
              {line.map((tok, j) => (
                <span key={j} className={'tok tok-' + tok.t}>
                  {tok.s}
                </span>
              ))}
              {'\n'}
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}
