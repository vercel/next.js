// Models the marketing/blog payload profile: cards are server-rendered
// markup (dense spans and list items whose leaf props are preservable),
// with small client atoms per card, structured-data JSON-LD, and repeated
// utility class strings — the composition production blog indexes show.
import '../bench.css'
import Avatar from '../ui/avatar'
import TagPill from '../ui/tag-pill'
import PostGrid from '../ui/post-grid'
import SavePost from '../ui/save-post'
import MegaNav from '../ui/mega-nav'
import SearchInput from '../ui/search-input'
import ThemeToggle from '../ui/theme-toggle'
import { posts } from '../lib/data'

export const dynamic = 'force-dynamic'

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

// The first page of cards is server-rendered for instant first paint;
// the client grid below also receives the data for filtering, like
// production blog indexes do.
function ServerPostCard({ post }) {
  return (
    <article className="post-card" data-post={post.slug}>
      <Cover cover={post.cover} />
      <div className="post-body">
        <div className="post-tags flex items-center gap-2 truncate">
          {post.tags.map((t) => (
            <TagPill key={t} tag={t} />
          ))}
        </div>
        <h3 className="truncate text-sm font-medium">{post.title}</h3>
        <p className="text-sm text-muted">{post.excerpt}</p>
        <div className="post-meta flex items-center gap-2 truncate text-xs text-muted">
          <Avatar
            name={post.author.name}
            hue={post.author.avatarHue}
            size={20}
            title={post.author.title}
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
  )
}

function jsonLd(post) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.seo.description,
    author: { '@type': 'Person', name: post.author.name },
    datePublished: post.publishedAt,
    url: post.seo.canonical,
    image: post.seo.ogImage,
  })
}

export default function BlogPage() {
  const [featured, ...rest] = posts
  return (
    <>
      <header className="app-header">
        <nav className="crumbs" aria-label="Breadcrumb">
          <strong>Acme</strong>
          <span className="sep">/</span>
          <span className="current">Blog</span>
        </nav>
        <MegaNav />
        <div className="header-spacer" />
        <SearchInput placeholder="Search posts…" />
        <ThemeToggle />
      </header>
      <main className="blog-main">
        <section className="blog-hero">
          <Cover cover={featured.cover} />
          <div>
            <div className="post-tags flex items-center gap-2">
              {featured.tags.map((t) => (
                <TagPill key={t} tag={t} />
              ))}
            </div>
            <h1>{featured.title}</h1>
            <p className="text-sm text-muted">{featured.excerpt}</p>
            <div className="post-meta flex items-center gap-2 text-xs text-muted">
              <Avatar
                name={featured.author.name}
                hue={featured.author.avatarHue}
                size={24}
              />
              <span>
                {featured.author.name} · {featured.author.role}
              </span>
              <span>
                · {featured.publishedAt} · {featured.readingMinutes} min read
              </span>
            </div>
          </div>
        </section>
        <section className="post-grid" aria-label="Latest posts">
          {rest.slice(0, 12).map((post) => (
            <ServerPostCard key={post.id} post={post} />
          ))}
        </section>
        <h2 className="more-posts">All posts</h2>
        <PostGrid posts={rest} />
        {posts.slice(0, 6).map((post) => (
          <script
            key={post.id}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLd(post) }}
          />
        ))}
      </main>
    </>
  )
}
