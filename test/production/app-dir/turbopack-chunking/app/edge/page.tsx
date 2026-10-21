import { BulkyC } from '../../components/bulky-c'
import { BulkyD } from '../../components/bulky-d'
import { BulkyE } from '../../components/bulky-e'

export const runtime = 'edge'

export default function Page() {
  return (
    <main>
      <h1 id="page-edge">page edge</h1>
      <BulkyC />
      <BulkyD />
      <BulkyE />
    </main>
  )
}
