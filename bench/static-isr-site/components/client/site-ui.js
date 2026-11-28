'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function SearchBox({ placeholder, suggestions }) {
  const [query, setQuery] = useState('')
  const matches = query
    ? suggestions.filter((s) => s.toLowerCase().includes(query.toLowerCase()))
    : []
  return (
    <form className="search" role="search" action="/search">
      <input
        type="search"
        name="q"
        value={query}
        placeholder={placeholder}
        onChange={(event) => setQuery(event.target.value)}
      />
      {matches.length > 0 ? (
        <ul className="search-suggestions">
          {matches.map((match) => (
            <li key={match}>{match}</li>
          ))}
        </ul>
      ) : null}
    </form>
  )
}

export function NewsletterForm({ heading, cta }) {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  return (
    <form
      className="newsletter"
      onSubmit={(event) => {
        event.preventDefault()
        setDone(true)
      }}
    >
      <label>
        {heading}
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <button type="submit">{done ? 'Subscribed' : cta}</button>
    </form>
  )
}

export function TableOfContents({ items }) {
  const [active, setActive] = useState(items[0]?.id)
  return (
    <nav className="toc" aria-label="On this page">
      <ol>
        {items.map((item) => (
          <li key={item.id} data-active={item.id === active}>
            <a href={`#${item.id}`} onClick={() => setActive(item.id)}>
              {item.heading}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function ShareButtons({ url, title }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="share">
      <a href={`https://social.example/share?u=${encodeURIComponent(url)}`}>
        Share “{title}”
      </a>
      <button type="button" onClick={() => setCopied(true)}>
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  )
}

export function DocsSidebar({ sections }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(null)
  return (
    <nav className="docs-sidebar" aria-label="Documentation">
      {sections.map((section) => {
        const current = pathname.startsWith(`/docs/${section.section}/`)
        const expanded = open === null ? current : open === section.section
        return (
          <section key={section.section} data-current={current}>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen(section.section)}
            >
              {section.label}
            </button>
            <ul hidden={!expanded}>
              {section.topics.map((topic) => (
                <li key={topic.href}>
                  <Link
                    href={topic.href}
                    aria-current={pathname === topic.href ? 'page' : undefined}
                  >
                    {topic.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </nav>
  )
}
