// Shared Server Components: the site chrome and the product card.
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { ALL_LOCALES } from '../lib/content.mjs'
import {
  AddToCart,
  CartButton,
  LocaleSwitcher,
  MobileMenu,
  SearchBox,
} from './client/shell'

// The header renders every navigation link (300 at the default), each a
// `<Link>`.
export function SiteHeader({ site }) {
  return (
    <header className="site-header">
      <p className="announcement">{site.announcement}</p>
      <div className="bar">
        <Link className="logo" href={`/${site.locale}`}>
          {site.name}
        </Link>
        <SearchBox placeholder={site.tagline} categories={site.categories} />
        <Suspense fallback={null}>
          <LocaleSwitcher locale={site.locale} locales={ALL_LOCALES} />
        </Suspense>
        <CartButton label="Open cart" />
        <MobileMenu menu={site.menu} label="Menu" />
      </div>
      <nav className="mega" aria-label="Main">
        <ul>
          {site.menu.map((group, i) => (
            <li key={i}>
              <span>{group.title}</span>
              <ul>
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}

export function SiteFooter({ site }) {
  return (
    <footer className="site-footer">
      <nav aria-label="Footer">
        {site.footer.map((group, i) => (
          <section key={i}>
            <h2>{group.title}</h2>
            <ul>
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
      <ul className="social">
        {site.social.map((link) => (
          <li key={link.name}>
            <a href={link.href} rel="noreferrer">
              {link.name}
            </a>
          </li>
        ))}
      </ul>
      <p>
        {site.name}. {site.tagline}
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
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function Price({ price, compareAt, currency }) {
  return (
    <p className="price">
      <span>
        {currency} {price.toFixed(2)}
      </span>
      {compareAt ? (
        <s>
          {currency} {compareAt.toFixed(2)}
        </s>
      ) : null}
    </p>
  )
}

export function Rating({ rating, count }) {
  return (
    <p className="rating" aria-label={`${rating} out of 5`}>
      <span aria-hidden="true">
        {'★'.repeat(Math.round(rating))}
        {'☆'.repeat(5 - Math.round(rating))}
      </span>
      {count === undefined ? null : <span> ({count})</span>}
    </p>
  )
}

export function ProductCard({ product, currency }) {
  return (
    <article className="card">
      <Link href={product.href}>
        <Image
          src={product.image.src}
          alt={product.image.alt}
          width={320}
          height={320}
          sizes="(min-width: 960px) 25vw, 50vw"
        />
        <h3>{product.name}</h3>
      </Link>
      <p className="brand">{product.brand}</p>
      <Rating rating={product.rating} count={product.reviewCount} />
      <Price
        price={product.price}
        compareAt={product.compareAt}
        currency={currency}
      />
      <AddToCart product={product} compact />
    </article>
  )
}
