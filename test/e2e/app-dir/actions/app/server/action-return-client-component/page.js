import { getComponent } from './actions'
import { Form } from './form'

export default function Page() {
  return (
    <>
      <h1>Server Component loading client component through action</h1>
      <Form action={getComponent} />
    </>
  )
}
