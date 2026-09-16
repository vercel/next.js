'use client'

import { useState } from 'react'
import { HeroCard } from './components/hero-card'
import { ProductCard } from './components/product-card'

export default function Page() {
  const [showProduct, setShowProduct] = useState(true)

  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="/">
          FIELDWORK<span>®</span>
        </a>
        <span>Everyday objects. Better considered.</span>
        <span className="edition">AUTUMN / 026</span>
      </header>
      <div className="collection">
        <HeroCard />
        {showProduct && <ProductCard />}
      </div>
      <footer>
        <span>Thoughtfully made. Ready for the long way home.</span>
        <button
          id="toggle-product"
          onClick={() => setShowProduct(!showProduct)}
        >
          {showProduct ? 'Hide product' : 'Show product'}
        </button>
      </footer>
    </main>
  )
}
