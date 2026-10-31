import { getImageProps } from 'next/image'
import Link from 'next/link'
import { AddToCart } from '@/components/cart'
import { Gallery } from '@/components/gallery'
import { Icon } from '@/components/icon'
import { Reviews } from '@/components/reviews'
import { Sprite } from '@/components/sprite'
import { Stars } from '@/components/stars'
import { formatPrice, type Product } from '@/lib/catalog'

export function ProductView({
  product,
  more,
}: {
  product: Product
  more: Product[]
}) {
  const photos = product.gallery.map((src) => ({
    src,
    main: getImageProps({
      src,
      alt: product.name,
      width: 560,
      height: 560,
      loading: 'eager',
      fetchPriority: 'high',
      className: 'product-photo',
    }).props,
    thumb: getImageProps({
      src,
      alt: '',
      width: 120,
      height: 120,
      className: 'thumb-photo',
    }).props,
  }))
  return (
    <main>
      <div className="product">
        <Gallery photos={photos} />
        <div>
          <p>{product.category}</p>
          <h1>{product.name}</h1>
          <Stars rating={product.rating} />
          <p className="price">{formatPrice(product.price)}</p>
          <p>{product.summary}</p>
          <AddToCart>
            <Icon name="cart" /> Add to cart
          </AddToCart>
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
      <Sprite star />
    </main>
  )
}
