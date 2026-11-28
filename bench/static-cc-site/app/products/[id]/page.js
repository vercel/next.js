import { Suspense } from 'react'
import {
  Breadcrumbs,
  Price,
  ProductCard,
  Rating,
} from '../../../../static-isr-site/components/site'
import {
  Gallery,
  HelpfulButton,
  VariantPicker,
} from '../../../../static-isr-site/components/client/product-ui'
import { counts, getProductSummary } from '../../../../static-isr-site/lib/data'
import { MemberOffer, StockStatus } from '../../../components/dynamic'
import {
  MemberOfferSkeleton,
  StockSkeleton,
} from '../../../components/skeletons'
import { getProduct } from '../../../lib/cms'
import { holesEnabled } from '../../../lib/session'

export function generateStaticParams() {
  const params = []
  for (let i = 0; i < counts().products; i++) params.push({ id: String(i) })
  return params
}

export async function generateMetadata({ params }) {
  const { id } = await params
  const product = await getProduct(id)
  const description = product.highlights.join(' ')
  return {
    title: `${product.name} by ${product.brand}`,
    description,
    alternates: { canonical: `/products/${id}` },
    openGraph: {
      title: product.name,
      description,
      url: `/products/${id}`,
      images: product.images.slice(0, 2).map((image) => ({
        url: image.src,
        width: image.width,
        height: image.height,
        alt: image.alt,
      })),
    },
    twitter: { card: 'summary_large_image', title: product.name },
  }
}

function Reviews({ reviews }) {
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
  const { id } = await params
  const product = await getProduct(id)
  const summary = getProductSummary(id)
  const holes = holesEnabled()
  return (
    <>
      <Breadcrumbs
        items={[
          { href: '/', label: 'Home' },
          { href: `/category/${product.category}/1`, label: product.category },
          { label: product.name },
        ]}
      />
      <div className="product">
        <Gallery images={product.images} />
        <section className="product-info">
          <p className="brand">{product.brand}</p>
          <h1>{product.name}</h1>
          <Rating rating={product.rating} count={product.reviewCount} />
          <Price price={product.price} compareAt={product.compareAt} />
          {holes ? (
            <Suspense fallback={<MemberOfferSkeleton />}>
              <MemberOffer productId={id} price={product.price} />
            </Suspense>
          ) : null}
          <ul className="highlights">
            {product.highlights.map((highlight, i) => (
              <li key={i}>{highlight}</li>
            ))}
          </ul>
          {holes ? (
            <Suspense fallback={<StockSkeleton />}>
              <StockStatus productId={id} />
            </Suspense>
          ) : null}
          <VariantPicker product={summary} variants={product.variants} />
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
      <Reviews reviews={product.reviews} />
      <section className="related">
        <h2>You may also like</h2>
        <div className="grid">
          {product.related.map((relatedId) => (
            <ProductCard
              key={relatedId}
              product={getProductSummary(relatedId)}
            />
          ))}
        </div>
      </section>
    </>
  )
}
