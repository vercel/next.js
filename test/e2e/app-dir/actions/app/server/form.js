import { redirect } from 'next/navigation'

async function action(formData) {
  'use server'
  redirect('/header?name=' + formData.get('name'))
}

export default function Form() {
  return (
    <>
      <hr />
      <form action="" method="POST">
        <input type="text" name="name" id="name" required />
        <input type="text" name="$$id" value={action.$$id} hidden readOnly />
        <button type="submit" id="submit">
          Submit
        </button>
      </form>
    </>
  )
}
