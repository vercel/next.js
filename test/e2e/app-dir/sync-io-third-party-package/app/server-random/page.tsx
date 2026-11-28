import { createToken } from 'external-random'

export default function Page() {
  return <p>{createToken()}</p>
}
