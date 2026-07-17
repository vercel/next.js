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
import BlogSearch from '../ui/blog-search'
import ThemeToggle from '../ui/theme-toggle'
import ReadingProgress from '../ui/reading-progress'
import CategoryFilter from '../ui/category-filter'
import CarouselControls from '../ui/carousel-controls'
import LikeButton from '../ui/like-button'
import ShareMenu from '../ui/share-menu'
import NewsletterForm from '../ui/newsletter-form'
import LoadMore from '../ui/load-more'
import VideoEmbed from '../ui/video-embed'
import PodcastTeaser from '../ui/podcast-teaser'
import LocalePicker from '../ui/locale-picker'
import IconXSocial from '../ui/icons/x-social'
import IconLinkedin from '../ui/icons/linkedin'
import IconYoutube from '../ui/icons/youtube'
import IconRss from '../ui/icons/rss'
import IconHeart from '../ui/icons/heart'
import IconMail from '../ui/icons/mail'
import IconCalendar from '../ui/icons/calendar'
import IconLink from '../ui/icons/link'
import IconShare from '../ui/icons/share'
import IconPlay from '../ui/icons/play'
import IconSparkles from '../ui/icons/sparkles'
import IconTrendingUp from '../ui/icons/trending-up'
import IconHeadphones from '../ui/icons/headphones'
import IconFilter from '../ui/icons/filter'
import { posts, categories } from '../lib/data'

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
          <IconCalendar size={12} />
          <time dateTime={post.publishedAt}>{post.publishedAt}</time>
          <span>·</span>
          <span>{post.readingMinutes} min</span>
          {post.stats.views > 60000 ? (
            <span className="trending-pill">
              <IconTrendingUp size={11} /> Trending
            </span>
          ) : null}
          <span className="header-spacer" />
          <LikeButton
            slug={post.slug}
            count={post.stats.likes}
            icon={<IconHeart size={13} />}
          />
          <ShareMenu
            slug={post.slug}
            trigger={<IconShare size={13} />}
            items={[
              { label: 'Share on X', icon: <IconXSocial size={12} /> },
              { label: 'Share on LinkedIn', icon: <IconLinkedin size={12} /> },
              { label: 'Copy link', icon: <IconLink size={12} /> },
            ]}
          />
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
      <ReadingProgress />
      <header className="app-header">
        <nav className="crumbs" aria-label="Breadcrumb">
          <strong>Acme</strong>
          <span className="sep">/</span>
          <span className="current">Blog</span>
        </nav>
        <MegaNav />
        <div className="header-spacer" />
        <BlogSearch placeholder="Search posts…" />
        <ThemeToggle />
      </header>
      <main className="blog-main">
        <CategoryFilter
          categories={Object.values(categories)}
          icon={<IconFilter size={13} />}
        />
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
        <div className="section-head flex items-center gap-2">
          <h2 className="more-posts">Latest posts</h2>
          <span className="header-spacer" />
          <CarouselControls pages={4} label="Browse latest posts" />
        </div>
        <section className="post-grid" aria-label="Latest posts">
          {rest.slice(0, 12).map((post) => (
            <ServerPostCard key={post.id} post={post} />
          ))}
        </section>

        <section className="media-row" aria-label="Watch and listen">
          <VideoEmbed
            title="Keynote: the state of the framework"
            duration="42:18"
            hue={262}
            playIcon={<IconPlay size={22} />}
          />
          <PodcastTeaser
            title="Shipping the App Router migration"
            episode={48}
            icon={<IconHeadphones size={18} />}
          />
          <div className="newsletter-box">
            <h3>
              <IconSparkles size={14} /> What's new, monthly
            </h3>
            <p className="text-sm text-muted">
              One email a month with the best posts and release notes.
            </p>
            <NewsletterForm icon={<IconMail size={14} />} />
          </div>
        </section>

        <h2 className="more-posts">All posts</h2>
        <PostGrid posts={rest} />
        <LoadMore total={rest.length} pageSize={24} />
        {posts.slice(0, 6).map((post) => (
          <script
            key={post.id}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLd(post) }}
          />
        ))}
        <footer className="blog-footer flex items-center gap-2 text-xs text-muted">
          <span>© Acme Inc.</span>
          <a href="#" aria-label="Acme on X">
            <IconXSocial size={14} />
          </a>
          <a href="#" aria-label="Acme on YouTube">
            <IconYoutube size={14} />
          </a>
          <a href="#" aria-label="Acme on LinkedIn">
            <IconLinkedin size={14} />
          </a>
          <a href="#" aria-label="RSS feed">
            <IconRss size={14} />
          </a>
          <span className="header-spacer" />
          <LocalePicker />
        </footer>
      </main>
    </>
  )
}
