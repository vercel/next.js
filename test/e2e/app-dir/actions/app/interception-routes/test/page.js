import { Form } from '../form'

export default function TestPage() {
  async function action(data) {
    'use server'

    return 'Action Submitted (Page)'
  }

  return (
    <div id="children-data">
      in "page"
      <Form action={action} id="submit-page-action" />
    </div>
  )
}
