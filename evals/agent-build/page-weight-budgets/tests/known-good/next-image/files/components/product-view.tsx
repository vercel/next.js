'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useCart } from '@/components/cart'
import { Icon } from '@/components/icon'
import type { Review } from '@/lib/catalog'

export function ProductGallery({
  name,
  gallery,
}: {
  name: string
  gallery: string[]
}) {
  const [photo, setPhoto] = useState(gallery[0])
  return (
    <div>
      <Image
        src={photo}
        alt={name}
        width={560}
        height={560}
        loading="eager"
        fetchPriority="high"
        className="product-photo"
      />
      <div className="thumbs">
        {gallery.map((src, i) => (
          <button
            key={src}
            type="button"
            aria-label={`Show photo ${i + 1}`}
            onClick={() => setPhoto(src)}
          >
            <Image
              src={src}
              alt=""
              width={120}
              height={120}
              loading="eager"
              className="thumb-photo"
            />
          </button>
        ))}
      </div>
    </div>
  )
}

export function AddToCart() {
  const { add } = useCart()
  const [added, setAdded] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => {
          add()
          setAdded(true)
        }}
      >
        <Icon name="cart" /> Add to cart
      </button>
      {added ? <p role="status">Added to your cart</p> : null}
    </>
  )
}

export function Reviews({ reviews: all }: { reviews: Review[] }) {
  const [allReviews, setAllReviews] = useState(false)
  const reviews = allReviews ? all : all.slice(0, 3)
  return (
    <section aria-label="Reviews">
      <h2>Reviews</h2>
      <ul>
        {reviews.map((r) => (
          <li key={r.id}>
            <strong>{r.title}</strong> · {r.author}, {r.date}
            <p>{r.body}</p>
          </li>
        ))}
      </ul>
      {!allReviews ? (
        <button type="button" onClick={() => setAllReviews(true)}>
          Show all {all.length} reviews
        </button>
      ) : null}
    </section>
  )
}
