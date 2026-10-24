import { Suspense } from 'react'
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query'
import { getProduct } from '@/lib/products'
import { productQuery } from './product-query'
import { ProductView } from './product-view'

async function ProductData({ id }: { id: string }) {
  const queryClient = new QueryClient()

  await queryClient.prefetchQuery({
    ...productQuery(id),
    queryFn: () => getProduct(id),
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProductView id={id} />
    </HydrationBoundary>
  )
}

export default function ProductPage({ params }: PageProps<'/products/[id]'>) {
  return (
    <Suspense fallback={<p>Loading product…</p>}>
      {params.then(({ id }) => (
        <ProductData id={id} />
      ))}
    </Suspense>
  )
}
