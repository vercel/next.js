import { forbidden } from 'next/navigation'

export default function Page() {
  forbidden()

  return <p>This will never render</p>
}
