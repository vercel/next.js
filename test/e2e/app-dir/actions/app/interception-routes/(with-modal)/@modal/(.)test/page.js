import { Form } from '../../../form'

export default function TestPageIntercepted() {
  async function action(data) {
    'use server'

    return 'Action Submitted (Intercepted)'
  }

  return (
    <div id="modal-data">
      in "modal"
      <Form action={action} id="submit-intercept-action" />
    </div>
  )
}
