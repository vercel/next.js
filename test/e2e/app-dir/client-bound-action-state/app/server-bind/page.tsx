import { updateUser } from '../actions'
import { BoundForm } from '../bound-form'

export default function Page() {
  const updateUserWithId = updateUser.bind(null, 'server-user')
  return <BoundForm action={updateUserWithId} />
}
