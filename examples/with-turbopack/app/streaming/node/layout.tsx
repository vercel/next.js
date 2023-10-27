import { Boundary } from '#/ui/boundary'
import { cookies } from 'next/headers'
import React from 'react'
import { CartCountProvider } from '../_components/cart-count-context'
import { Header } from '../_components/header'

export const metadata = {
  title: 'Streaming (Node Runtime)',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const cartCount = Number(cookies().get('_cart_count')?.value || '0')

  return (
    <>
      <div className="prose prose-sm prose-invert mb-8 max-w-none">
        <ul>
          <li>
            Primary product information is loaded first as part of the initial
            response.
          </li>
          <li>
            Secondary, more personalized details (that might be slower) like
            ship date, other recommended products, and customer reviews are
            progressively streamed in.
          </li>
          <li>Try refreshing or navigating to other recommended products.</li>
        </ul>
      </div>
      <Boundary animateRerendering={false} labels={['Demo']} size="small">
        <CartCountProvider initialCartCount={cartCount}>
          <div className="space-y-10">
            <Header />

            {children}
          </div>
        </CartCountProvider>
      </Boundary>
    </>
  )
}
