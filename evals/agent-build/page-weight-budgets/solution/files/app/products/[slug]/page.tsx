import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AddToCart } from '@/components/cart'
import { Gallery } from '@/components/gallery'
import { MoreReviews } from '@/components/more-reviews'
import { Stars } from '@/components/stars'
import { getProduct, products, related, type Review } from '@/lib/catalog'
import { formatPrice } from '@/lib/format'

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({
  params,
}: PageProps<'/products/[slug]'>): Promise<Metadata> {
  return { title: getProduct((await params).slug)?.name }
}

function ReviewItem({ review }: { review: Review }) {
  return (
    <li>
      <strong>{review.title}</strong> · {review.author}, {review.date}
      <p>{review.body}</p>
    </li>
  )
}

export default async function ProductPage({
  params,
}: PageProps<'/products/[slug]'>) {
  const product = getProduct((await params).slug)
  if (!product) notFound()
  return (
    <main>
      <div className="product">
        <Gallery name={product.name} photos={product.gallery} />
        <div>
          <p>{product.category}</p>
          <h1>{product.name}</h1>
          <Stars rating={product.rating} />
          <p className="price">{formatPrice(product.price)}</p>
          <p>{product.summary}</p>
          <AddToCart />
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
          {product.reviews.slice(0, 3).map((r) => (
            <ReviewItem key={r.id} review={r} />
          ))}
          <MoreReviews total={product.reviews.length}>
            {product.reviews.slice(3).map((r) => (
              <ReviewItem key={r.id} review={r} />
            ))}
          </MoreReviews>
        </ul>
      </section>
      <section aria-label="You may also like">
        <h2>You may also like</h2>
        <ul>
          {related(product).map((p) => (
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
