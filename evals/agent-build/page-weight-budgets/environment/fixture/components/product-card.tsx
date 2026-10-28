'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Icon } from '@/components/icon'
import { formatPrice, type Product } from '@/lib/catalog'
import { STAR_PATH } from '@/lib/star-path'

export function ProductCard({ product }: { product: Product }) {
  const [saved, setSaved] = useState(false)
  return (
    <li className="card">
      <Link href={`/products/${product.slug}`}>
        <img
          src={product.image}
          alt={product.name}
          width={280}
          height={280}
          className="card-photo"
        />
        <h3>{product.name}</h3>
      </Link>
      <p className="price">{formatPrice(product.price)}</p>
      <span
        className="stars"
        role="img"
        aria-label={`${product.rating} out of 5`}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <svg
            key={i}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill={i <= Math.round(product.rating) ? '#e0a526' : '#d6d6d6'}
            aria-hidden
          >
            <path d={STAR_PATH} />
          </svg>
        ))}
      </span>
      <button
        type="button"
        aria-pressed={saved}
        aria-label={`Save ${product.name}`}
        onClick={() => setSaved(!saved)}
      >
        <Icon name={saved ? 'heart-filled' : 'heart'} />
      </button>
    </li>
  )
}
