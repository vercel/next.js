import { unauthorized } from 'next/navigation'

export default function Page() {
  unauthorized()

  return <p>This will never render</p>
}
