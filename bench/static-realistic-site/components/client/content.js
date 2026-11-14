'use client'

import Link from 'next/link'
import { useState } from 'react'

export function CodeBlock({ lang, text }) {
  const [copied, setCopied] = useState(false)
  return (
    <figure className="code" data-lang={lang}>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(text)
          setCopied(true)
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre>
        <code>{text}</code>
      </pre>
    </figure>
  )
}

export function TableOfContents({ headings, label }) {
  const [active, setActive] = useState(headings[0]?.id)
  return (
    <nav className="toc" aria-label={label}>
      <ol>
        {headings.map((heading) => (
          <li key={heading.id} className={heading.t}>
            <a
              href={`#${heading.id}`}
              aria-current={heading.id === active ? 'location' : undefined}
              onClick={() => setActive(heading.id)}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

// The docs sidebar: gets the whole tree of a product version as props.
export function DocsSidebar({ tree, current }) {
  const [filter, setFilter] = useState('')
  const needle = filter.toLowerCase()
  return (
    <nav className="docs-sidebar" aria-label={tree.title}>
      <input
        type="search"
        value={filter}
        placeholder="Filter"
        onChange={(e) => setFilter(e.target.value)}
      />
      <ul>
        {tree.sections.map((section) => (
          <li key={section.slug}>
            <span>{section.title}</span>
            <ul>
              {section.topics
                .filter((topic) => topic.title.toLowerCase().includes(needle))
                .map((topic) => (
                  <li key={topic.slug}>
                    <Link
                      href={topic.href}
                      aria-current={topic.href === current ? 'page' : undefined}
                    >
                      {topic.title}
                    </Link>
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  )
}
