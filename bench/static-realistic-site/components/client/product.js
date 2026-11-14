'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'
import { AddToCart } from './shell'

export function Gallery({ images }) {
  const [active, setActive] = useState(0)
  const image = images[active]
  return (
    <div className="gallery">
      <Image
        className="gallery-main"
        src={image.src}
        alt={image.alt}
        width={image.width}
        height={image.height}
        sizes="(min-width: 960px) 50vw, 100vw"
        priority
      />
      <ul className="gallery-thumbs">
        {images.map((thumb, i) => (
          <li key={thumb.src}>
            <button
              type="button"
              aria-pressed={i === active}
              onClick={() => setActive(i)}
            >
              <Image src={thumb.src} alt={thumb.alt} width={96} height={96} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Gets every variant, the size chart and the shipping table as props.
export function VariantPicker({ product, variants, sizeChart, shipping }) {
  const colors = useMemo(
    () => [...new Set(variants.map((v) => v.color))],
    [variants]
  )
  const sizes = useMemo(
    () => [...new Set(variants.map((v) => v.size))],
    [variants]
  )
  const [color, setColor] = useState(colors[0])
  const [size, setSize] = useState(sizes[0])
  const [chart, setChart] = useState(false)
  const variant =
    variants.find((v) => v.color === color && v.size === size) || variants[0]
  return (
    <div className="variant-picker">
      <fieldset>
        <legend>Color</legend>
        {colors.map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="color"
              value={value}
              checked={value === color}
              onChange={() => setColor(value)}
            />
            {value}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Size</legend>
        {sizes.map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="size"
              value={value}
              checked={value === size}
              onChange={() => setSize(value)}
            />
            {value}
          </label>
        ))}
      </fieldset>
      <p className="variant-stock" data-sku={variant.sku}>
        {variant.stock > 0 ? `${variant.stock} in stock` : 'Out of stock'},{' '}
        {variant.weightGrams} g, {variant.attributes.material} from{' '}
        {variant.attributes.origin}
      </p>
      <AddToCart product={product} sku={variant.sku} />
      <button
        type="button"
        aria-expanded={chart}
        onClick={() => setChart((v) => !v)}
      >
        Size chart
      </button>
      {chart ? (
        <table className="size-chart">
          <thead>
            <tr>
              {sizeChart.head.map((cell) => (
                <th key={cell} scope="col">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sizeChart.rows.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, i) => (
                  <td key={i}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <details className="shipping">
        <summary>Shipping to {shipping.length} regions</summary>
        <ul>
          {shipping.map((row) => (
            <li key={row.to}>
              {row.to.toUpperCase()}: {row.days} days with {row.carrier},{' '}
              {row.price === 0 ? 'free' : row.price}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

export function HelpfulButton({ reviewId, count }) {
  const [votes, setVotes] = useState(count)
  return (
    <button
      type="button"
      className="helpful"
      data-review={reviewId}
      onClick={() => setVotes((v) => v + 1)}
    >
      Helpful ({votes})
    </button>
  )
}

// A sortable listing: gets the full product records as props.
export function ProductTable({ products, currency }) {
  const [sort, setSort] = useState('name')
  const rows = useMemo(
    () =>
      [...products].sort((a, b) =>
        sort === 'price' ? a.price - b.price : a.name.localeCompare(b.name)
      ),
    [products, sort]
  )
  return (
    <table className="product-table">
      <thead>
        <tr>
          <th scope="col">
            <button type="button" onClick={() => setSort('name')}>
              Name
            </button>
          </th>
          <th scope="col">Brand</th>
          <th scope="col">Rating</th>
          <th scope="col">
            <button type="button" onClick={() => setSort('price')}>
              Price
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((product) => (
          <tr key={product.id}>
            <th scope="row">{product.name}</th>
            <td>{product.brand}</td>
            <td>
              {product.rating} ({product.reviewCount})
            </td>
            <td>
              {currency} {product.price.toFixed(2)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
