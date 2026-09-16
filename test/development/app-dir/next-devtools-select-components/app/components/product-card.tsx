'use client'

import { useState } from 'react'

export function ProductCard() {
  const [count, setCount] = useState(0)
  return (
    <article className="product-card">
      <div className="product-art" aria-label="Terracotta canvas bag">
        <span className="product-label">A GOOD COMPANION</span>
        <div className="bag">
          <div className="bag-handle" />
          <span>FIELDWORK</span>
        </div>
        <span className="product-number">NO. 004</span>
      </div>
      <div className="product-details">
        <div>
          <h2 id="product-title">The everyday tote</h2>
          <span className="price">$48</span>
        </div>
        <p>Heavyweight canvas / Terracotta</p>
        <button id="product-action" onClick={() => setCount(count + 1)}>
          Add to bag · <span id="bag-count">{count}</span>
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </article>
  )
}
