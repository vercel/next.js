import Test from './test'

export default async function Page() {
  let action
  try {
    await import('./action')
  } catch (e) {
    action = e.toString()
  }
  return (
    <div>
      <Test action={action} />
    </div>
  )
}
