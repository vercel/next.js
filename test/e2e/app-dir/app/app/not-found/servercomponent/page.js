// TODO-APP: enable when flight error serialization is implemented
import { NotFound } from 'next/navigation'

export default function Page() {
  throw new NotFound()
}
