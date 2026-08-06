import { Cached } from './cached'
import { Form } from './form'

export default function Page() {
  return <Form getRandomValue={Cached.getRandomValue} />
}
