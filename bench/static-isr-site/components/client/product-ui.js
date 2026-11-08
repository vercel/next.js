'use client'

import { useState } from 'react'
import Image from 'next/image'
import { AddToCart } from './cart'

export function Gallery({ images }) {
  const [active, setActive] = useState(0)
  const current = images[active]
  return (
    <div className="gallery">
      <Image
        className="gallery-main"
        src={current.src}
        alt={current.alt}
        width={current.width}
        height={current.height}
        priority
      />
      <ul className="gallery-thumbs">
        {images.map((image, i) => (
          <li key={image.src}>
            <button
              type="button"
              aria-pressed={i === active}
              onClick={() => setActive(i)}
            >
              <Image src={image.src} alt={image.alt} width={96} height={96} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function VariantPicker({ product, variants }) {
  const [sku, setSku] = useState(variants[0].sku)
  const selected = variants.find((v) => v.sku === sku)
  return (
    <form className="variant-picker">
      <fieldset>
        <legend>Choose a variant</legend>
        {variants.map((variant) => (
          <label key={variant.sku} className="variant">
            <input
              type="radio"
              name="sku"
              value={variant.sku}
              checked={variant.sku === sku}
              disabled={!variant.inStock}
              onChange={() => setSku(variant.sku)}
            />
            <span>
              {variant.color} / {variant.size}
              {variant.priceDelta > 0 ? ` (+$${variant.priceDelta})` : ''}
            </span>
          </label>
        ))}
      </fieldset>
      <p className="stock" aria-live="polite">
        {selected.inStock ? 'In stock' : 'Sold out'}
      </p>
      <AddToCart product={product} sku={sku} />
    </form>
  )
}

export function HelpfulButton({ reviewId, count }) {
  const [votes, setVotes] = useState(count)
  return (
    <button
      type="button"
      className="helpful"
      data-review={reviewId}
      onClick={() => setVotes(votes + 1)}
    >
      Helpful ({votes})
    </button>
  )
}

export function Filters({ category, facets }) {
  const [selected, setSelected] = useState({})
  const toggle = (group, value) =>
    setSelected((prev) => ({
      ...prev,
      [`${group}:${value}`]: !prev[`${group}:${value}`],
    }))
  return (
    <aside className="filters" aria-label={`Filter ${category}`}>
      {['brands', 'colors', 'sizes'].map((group) => (
        <fieldset key={group}>
          <legend>{group}</legend>
          {facets[group].map((facet) => (
            <label key={facet.value}>
              <input
                type="checkbox"
                checked={!!selected[`${group}:${facet.value}`]}
                onChange={() => toggle(group, facet.value)}
              />
              {facet.value} <small>({facet.count})</small>
            </label>
          ))}
        </fieldset>
      ))}
      <p>
        ${facets.price.min} – ${facets.price.max}
      </p>
    </aside>
  )
}
