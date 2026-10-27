import { string } from 'zod'

export default function Page() {
  return <p>{string().min(2).parse('valid')}</p>
}
