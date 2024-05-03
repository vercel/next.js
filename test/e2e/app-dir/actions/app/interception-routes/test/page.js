export default function TestPage() {
  async function action(data) {
    'use server'

    console.log('Action Submitted (Page)')
  }

  return (
    <form action={action} id="children-data">
      in "page"
      <button type="submit" id="submit-page-action">
        Test
      </button>
    </form>
  )
}
