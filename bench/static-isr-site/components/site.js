import Link from 'next/link'
import Image from 'next/image'
import { AddToCart, CartButton } from './client/cart'
import { NewsletterForm, SearchBox } from './client/site-ui'
import { CATEGORIES } from '../lib/data'

export function SiteHeader({ navigation }) {
  return (
    <header className="site-header">
      <Link href="/" className="logo">
        Northfold Supply
      </Link>
      <nav aria-label="Main">
        <ul className="menus">
          {navigation.menus.map((menu) => (
            <li key={menu.category} className="menu">
              <Link href={`/category/${menu.category}/1`}>{menu.label}</Link>
              <ul className="menu-links">
                {menu.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          <li>
            <Link href="/blog/field-notes-0">Field notes</Link>
          </li>
          <li>
            <Link href="/docs/getting-started/topic-1">Help</Link>
          </li>
        </ul>
      </nav>
      <SearchBox placeholder="Search the catalog" suggestions={CATEGORIES} />
      <CartButton label="Open cart" />
    </header>
  )
}

export function SiteFooter({ navigation }) {
  return (
    <footer className="site-footer">
      <div className="footer-columns">
        {navigation.footer.map((column) => (
          <section key={column.heading}>
            <h2>{column.heading}</h2>
            <ul>
              {column.links.map((link, i) => (
                <li key={i}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <NewsletterForm heading="Get field notes by email" cta="Subscribe" />
      <p className="legal">
        © Northfold Supply. Prices in USD. <Link href="/about">About us</Link>
      </p>
    </footer>
  )
}

export function Breadcrumbs({ items }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, i) => (
          <li key={i}>
            {item.href ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              item.label
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function Price({ price, compareAt }) {
  return (
    <p className="price">
      <span className="amount">${price.toFixed(2)}</span>
      {compareAt ? <s className="compare-at">${compareAt.toFixed(2)}</s> : null}
    </p>
  )
}

export function Rating({ rating, count }) {
  const full = Math.round(rating)
  return (
    <p className="rating" aria-label={`Rated ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= full ? 'star on' : 'star'}>
          ★
        </span>
      ))}
      {count != null ? <small>({count})</small> : null}
    </p>
  )
}

export function ProductCard({ product }) {
  return (
    <article className="product-card">
      <Link href={`/products/${product.id}`}>
        <Image
          src={product.image.src}
          alt={product.image.alt}
          width={320}
          height={320}
        />
        <h3>{product.name}</h3>
      </Link>
      <p className="brand">{product.brand}</p>
      <Rating rating={product.rating} count={product.reviewCount} />
      <Price price={product.price} compareAt={product.compareAt} />
      <AddToCart product={product} sku={`${product.id}-default`} compact />
    </article>
  )
}

export function ArticleTeaser({ article }) {
  return (
    <article className="article-teaser">
      <h3>
        <Link href={`/blog/${article.slug}`}>{article.title}</Link>
      </h3>
      <time dateTime={article.date}>{article.date}</time>
      <p>{article.excerpt}</p>
    </article>
  )
}
