import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AddToCart, ProductGallery, Reviews } from '@/components/product-view'
import { Stars } from '@/components/stars'
import { formatPrice, getProduct, products, related } from '@/lib/catalog'

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({
  params,
}: PageProps<'/products/[slug]'>): Promise<Metadata> {
  return { title: getProduct((await params).slug)?.name }
}

export default async function ProductPage({
  params,
}: PageProps<'/products/[slug]'>) {
  const product = getProduct((await params).slug)
  if (!product) notFound()
  const more = related(product)
  return (
    <main>
      <div className="product">
        <ProductGallery name={product.name} gallery={product.gallery} />
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
      <Reviews reviews={product.reviews} />
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
