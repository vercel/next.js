import { TaggedLink as Link } from '../../components'
import { lang } from 'next/root-params'

export default async function HomePage() {
  const currentLang = await lang()
  return (
    <div>
      <h1 data-testid="home-title">
        Partial Prefetch Shell Test (root params)
      </h1>
      <ul>
        <li>
          <Link href={`/with-root-param/${currentLang}/no-params`}>
            prefetch-auto link (only root params)
          </Link>
        </li>
      </ul>
    </div>
  )
}
