'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { Icon } from '@/components/icon'
import { Stars } from '@/components/stars'
import type { CardProduct } from '@/lib/catalog'
import { formatPrice } from '@/lib/format'

export function ProductCard({ product }: { product: CardProduct }) {
  const [saved, setSaved] = useState(false)
  return (
    <li className="card">
      <Link href={`/products/${product.slug}`}>
        <Image
          src={product.image}
          alt={product.name}
          width={280}
          height={280}
          className="card-photo"
        />
        <h3>{product.name}</h3>
      </Link>
      <p className="price">{formatPrice(product.price)}</p>
      <Stars rating={product.rating} />
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
