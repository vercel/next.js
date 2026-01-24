import { testAllowedOriginAction } from './action'
import { ClientForm } from './client-form'

export default function Page() {
  return (
    <div>
      <ClientForm action={testAllowedOriginAction} />
    </div>
  )
}
