'use client'

import Link from 'next/link'

export function HeroCard() {
  return (
    <section className="hero-card">
      <div className="eyebrow">
        <span className="dot" /> THE EVERYDAY COLLECTION
      </div>
      <p>
        Considered essentials for wherever the day takes you. Made to go
        further, with a little less.
      </p>
      <h1 id="hero-title">
        Less stuff.
        <br />
        More possibility.
      </h1>
      <Link id="hero-link" href="/collection" prefetch={false}>
        Explore the collection <span aria-hidden="true">↗</span>
      </Link>
      <div className="hero-footnote">
        <span>01 / BUILT FOR EVERY DAY</span>
        <span>DESIGNED TO LAST</span>
      </div>
    </section>
  )
}
