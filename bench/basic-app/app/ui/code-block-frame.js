'use client'
import { describeTooling } from './vendor-tooling'
import { describeUtils } from './vendor-util'
import { useState } from 'react'

// Interactive frame around server-rendered code: copy button and optional
// variant tabs (e.g. package managers). The highlighted spans render on the
// server and pass through as children.
export default function CodeBlockFrame({
  lang,
  filename,
  tabs,
  text,
  children,
}) {
  const [copied, setCopied] = useState(false)
  const [active, setActive] = useState(0)
  const kids = Array.isArray(children) ? children : [children]
  return (
    <div className="code-block" data-lang={lang}>
      {tabs ? (
        <div className="code-tabs" role="tablist">
          {tabs.map((tab, i) => (
            <button
              key={tab}
              role="tab"
              aria-selected={i === active}
              className={'code-tab' + (i === active ? ' code-tab-active' : '')}
              onClick={() => setActive(i)}
            >
              {tab}
            </button>
          ))}
        </div>
      ) : filename ? (
        <div className="code-filename">{filename}</div>
      ) : null}
      <button
        type="button"
        className="code-copy"
        onClick={() => {
          navigator.clipboard?.writeText(
            Array.isArray(text) ? text[active] : text
          )
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      {tabs ? kids[active] : children}
    </div>
  )
}

export const __layers = [describeUtils].length

export const __tooling = typeof describeTooling
