import { redirect, notFound } from 'next/navigation'

async function action(formData) {
  'use server'
  redirect(
    '/header?name=' +
      formData.get('name') +
      '&constructor=' +
      formData.constructor.name
  )
}

async function nowhere() {
  'use server'
  notFound()
}

async function file(formData) {
  'use server'
  const file = formData.get('file')
  console.log('File name:', file.name, 'size:', file.size)
}

export default function Form() {
  return (
    <>
      <hr />
      <form method="POST" action="">
        <input type="text" name="$$id" value={action.$$id} hidden readOnly />
        <input type="text" name="name" id="name" required />
        <button type="submit" id="submit">
          Submit
        </button>
      </form>
      <hr />
      <form method="POST" action="">
        <input type="text" name="$$id" value={nowhere.$$id} hidden readOnly />
        <button type="submit" id="nowhere">
          Go nowhere
        </button>
      </form>
      <hr />
      <form action={file}>
        <input type="file" name="file" id="file" required />
        <button type="submit" id="upload">
          Upload file
        </button>
      </form>
    </>
  )
}
