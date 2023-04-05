import { redirect, notFound } from 'next/navigation'

async function action(formData) {
  'use server'
  redirect('/header?name=' + formData.get('name'))
}

async function nowhere() {
  'use server'
  notFound()
}

export default function Form() {
  return (
    <>
      <hr />
      <form method="POST" action={action}>
        <input type="text" name="name" id="name" required />
        <button type="submit" id="submit">
          Submit
        </button>
      </form>
      <hr />
      <form method="POST" action={nowhere}>
        <button type="submit" id="nowhere">
          Go nowhere
        </button>
      </form>
    </>
  )
}
