import { redirect } from 'next/navigation'

async function action(formData) {
  'use server'
  redirect(
    '/header?name=' +
      formData.get('name') +
      '&hidden-info=' +
      formData.get('hidden-info')
  )
}

export default function Form() {
  return (
    <form action={action}>
      <input type="text" name="hidden-info" defaultValue="hi" hidden />
      <input type="text" name="name" id="name" required />
      <button type="submit" id="submit">
        Submit
      </button>
    </form>
  )
}
