'use client'
import { fixtureName } from './vendor-fixtures'
import { describeUtils } from './vendor-util'
import { useState } from 'react'
import Avatar from './avatar'
import TagPill from './tag-pill'
import SavePost from './save-post'

function Cover({ cover }) {
  return (
    <div
      className="cover"
      role="img"
      aria-label={cover.alt}
      style={{
        background: `linear-gradient(135deg, hsl(${cover.hueA} 70% 55%), hsl(${cover.hueB} 70% 40%))`,
      }}
    />
  )
}

// Minimal rich-text renderer for the CMS document shape, like the ones CMS
// SDKs ship. The index renders only the first paragraph as a preview; the
// full documents still travel with the posts, as list APIs return them.
function firstParagraph(doc) {
  const p = doc.content.find((n) => n.nodeType === 'paragraph')
  if (!p) return null
  return p.content.map((run, i) => {
    const text = run.value
    if (run.marks.some((m) => m.type === 'bold'))
      return <strong key={i}>{text}</strong>
    if (run.marks.some((m) => m.type === 'italic'))
      return <em key={i}>{text}</em>
    return text
  })
}

export default function PostGrid({ posts }) {
  const [category, setCategory] = useState(null)
  const shown = category
    ? posts.filter((p) => p.category.slug === category)
    : posts
  const cats = [
    ...new Map(posts.map((p) => [p.category.slug, p.category])).values(),
  ]
  return (
    <>
      <div className="filter-bar">
        <span className="label">
          {category ? shown.length + ' posts in ' + category : 'All posts'}
        </span>
        {cats.map((c) => (
          <button
            key={c.slug}
            type="button"
            className={
              'tag-pill' + (category === c.slug ? ' tag-pill-active' : '')
            }
            title={c.description}
            onClick={() => setCategory(category === c.slug ? null : c.slug)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="post-grid">
        {shown.map((post) => (
          <article key={post.id} className="post-card">
            <Cover cover={post.cover} />
            <div className="post-body">
              <div className="post-tags flex items-center gap-2 truncate">
                {post.tags.map((t) => (
                  <TagPill key={t} tag={t} />
                ))}
              </div>
              <h3 className="truncate text-sm font-medium">{post.title}</h3>
              <p className="text-sm text-muted">
                {firstParagraph(post.content)}
              </p>
              <div className="post-meta flex items-center gap-2 truncate text-xs text-muted">
                <Avatar
                  name={post.author.name}
                  hue={post.author.avatarHue}
                  size={20}
                />
                <span className="truncate">{post.author.name}</span>
                <span>·</span>
                <time dateTime={post.publishedAt}>{post.publishedAt}</time>
                <span>·</span>
                <span>{post.readingMinutes} min</span>
                <span className="header-spacer" />
                <SavePost slug={post.slug} />
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}

export const __layers = [fixtureName, describeUtils].length
