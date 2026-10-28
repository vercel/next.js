'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useCart } from '@/components/cart'
import { Icon } from '@/components/icon'
import { Stars } from '@/components/stars'
import { formatPrice, type Product } from '@/lib/catalog'

export function ProductView({
  product,
  catalog,
}: {
  product: Product
  catalog: Product[]
}) {
  const { add } = useCart()
  const [photo, setPhoto] = useState(product.gallery[0])
  const [allReviews, setAllReviews] = useState(false)
  const [added, setAdded] = useState(false)
  const more = catalog
    .filter((p) => p.category === product.category && p.slug !== product.slug)
    .slice(0, 4)
  const reviews = allReviews ? product.reviews : product.reviews.slice(0, 3)
  return (
    <main>
      <div className="product">
        <div>
          <img src={photo} alt={product.name} className="product-photo" />
          <div className="thumbs">
            {product.gallery.map((src, i) => (
              <button
                key={src}
                type="button"
                aria-label={`Show photo ${i + 1}`}
                onClick={() => setPhoto(src)}
              >
                <img src={src} alt="" className="thumb-photo" />
              </button>
            ))}
          </div>
        </div>
        <div>
          <p>{product.category}</p>
          <h1>{product.name}</h1>
          <Stars rating={product.rating} />
          <p className="price">{formatPrice(product.price)}</p>
          <p>{product.summary}</p>
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
          {product.description.split('\n\n').map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
          <table>
            <tbody>
              {Object.entries(product.specs).map(([k, v]) => (
                <tr key={k}>
                  <th scope="row">{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
            Show all {product.reviews.length} reviews
          </button>
        ) : null}
      </section>
      <section aria-label="You may also like">
        <h2>You may also like</h2>
        <ul>
          {more.map((p) => (
            <li key={p.slug}>
              <Link href={`/products/${p.slug}`}>{p.name}</Link> ·{' '}
              {formatPrice(p.price)}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
