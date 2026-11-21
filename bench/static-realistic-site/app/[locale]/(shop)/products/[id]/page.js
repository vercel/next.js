import { Suspense } from 'react'
import { getProduct, getReviews, getSite, list, read } from '@bench/data'
import {
  Gallery,
  HelpfulButton,
  VariantPicker,
} from '../../../../../components/client/product'
import {
  HOLES,
  HoleSkeleton,
  MemberOffer,
  StockStatus,
} from '../../../../../components/holes'
import {
  Breadcrumbs,
  Price,
  ProductCard,
  Rating,
} from '../../../../../components/site'
import { counts } from '../../../../../lib/content.mjs'

export async function generateStaticParams() {
  const ids = await list(`/index/products?n=${counts().products}`)
  return ids.map((id) => ({ id }))
}

// The same request as the page makes. The image comes from the
// `opengraph-image` route next to this file.
export async function generateMetadata({ params }) {
  const { locale, id } = await read(params)
  const product = await getProduct(locale, id)
  const description = product.highlights.join(' ')
  return {
    title: `${product.name} by ${product.brand}`,
    description,
    alternates: { canonical: `/${locale}/products/${id}` },
    openGraph: {
      title: product.name,
      description,
      url: `/${locale}/products/${id}`,
    },
  }
}

// Reads the reviews after the product: a request that depends on an
// earlier one.
async function Reviews({ id }) {
  const reviews = await getReviews(id)
  return (
    <section className="reviews" aria-labelledby="reviews-heading">
      <h2 id="reviews-heading">Reviews</h2>
      <ul>
        {reviews.map((review) => (
          <li key={review.id}>
            <article>
              <h3>{review.title}</h3>
              <Rating rating={review.rating} />
              <p className="byline">
                {review.author} on{' '}
                <time dateTime={review.date}>{review.date}</time>
              </p>
              <p>{review.body}</p>
              <HelpfulButton reviewId={review.id} count={review.helpful} />
            </article>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default async function ProductPage({ params }) {
  const { locale, id } = await read(params)
  const [site, product] = await Promise.all([
    getSite(locale),
    getProduct(locale, id),
  ])
  const { currency } = site
  return (
    <>
      <Breadcrumbs
        items={[
          { href: `/${locale}`, label: site.name },
          {
            href: `/${locale}/category/${product.category}`,
            label: product.category,
          },
          { label: product.name },
        ]}
      />
      <div className="product">
        <Gallery images={product.images} />
        <section className="product-info">
          <p className="brand">{product.brand}</p>
          <h1>{product.name}</h1>
          <Rating rating={product.rating} count={product.reviewCount} />
          <Price
            price={product.price}
            compareAt={product.compareAt}
            currency={currency}
          />
          {HOLES ? (
            <Suspense fallback={<HoleSkeleton label="Member price" />}>
              <MemberOffer
                productId={id}
                price={product.price}
                currency={currency}
              />
            </Suspense>
          ) : null}
          <ul className="highlights">
            {product.highlights.map((highlight, i) => (
              <li key={i}>{highlight}</li>
            ))}
          </ul>
          {HOLES ? (
            <Suspense fallback={<HoleSkeleton label="Stock" />}>
              <StockStatus productId={id} />
            </Suspense>
          ) : null}
          <VariantPicker
            product={{
              id: product.id,
              name: product.name,
              price: product.price,
            }}
            variants={product.variants}
            sizeChart={product.sizeChart}
            shipping={product.shipping}
          />
        </section>
      </div>
      <section className="description">
        <h2>About this product</h2>
        {product.description.map((text, i) => (
          <p key={i}>{text}</p>
        ))}
      </section>
      <section className="specs">
        <h2>Specifications</h2>
        <table>
          <tbody>
            {product.specs.map((spec, i) => (
              <tr key={i}>
                <th scope="row">{spec.label}</th>
                <td>{spec.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <Reviews id={id} />
      <section className="related">
        <h2>You may also like</h2>
        <div className="grid">
          {product.related.map((related) => (
            <ProductCard
              key={related.id}
              product={related}
              currency={currency}
            />
          ))}
        </div>
      </section>
    </>
  )
}
