import GuardedForm from './form'

export default function Page() {
  const user = null
  const signedIn = user !== null

  async function greet() {
    'use server'
    if (signedIn) {
      return 'hello ' + user.name
    } else {
      return 'hello guest'
    }
  }

  return (
    <div>
      <GuardedForm greet={greet} />
    </div>
  )
}
