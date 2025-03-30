import { createCached } from './cached'
import { Form } from './form'

export default function Page() {
  const cached1 = createCached(1)
  const cached2 = createCached(2)

  return (
    <main>
      <Form id="form-1" getRandomValue={cached1.getRandomValue} />
      <Form id="form-2" getRandomValue={cached2.getRandomValue} />
    </main>
  )
}
