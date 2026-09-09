import { getPromo } from '@/lib/queries'

export const revalidate = 300

export default async function HomePage() {
  const promo = await getPromo()
  return (
    <main>
      <h1 data-testid="home-heading">Welcome to Acme Outfitters</h1>
      <p data-testid="promo-banner">
        {promo.headline} Use code <strong>{promo.code}</strong> at checkout.
      </p>
    </main>
  )
}
