import { condition } from 'next-testing-stage3-conditions'
import { productionValue } from '../lib/profile'
import Subject from '../components/subject'

export default function Page() {
  return (
    <main>
      <p id="profile">
        {productionValue()}:{condition}
      </p>
      <Subject initial={10} />
    </main>
  )
}
