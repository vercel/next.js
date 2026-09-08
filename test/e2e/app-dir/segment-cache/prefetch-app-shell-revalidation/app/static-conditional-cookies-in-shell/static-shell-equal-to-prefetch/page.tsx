import { ConditionalCookies } from '../../../cached-value'

export default async function Page() {
  return (
    <main>
      <h1>Static page that conditionally uses cookies in the shell</h1>
      <ConditionalCookies />
    </main>
  )
}
