import { redirect, notFound } from 'next/navigation'

async function action(formData) {
  'use server'
  redirect(
    '/header?name=' +
      formData.get('name') +
      '&hidden-info=' +
      formData.get('hidden-info')
  )
}

async function nowhere() {
  'use server'
  notFound()
}

async function here() {
  'use server'
  // nothing
}

async function file(formData) {
  'use server'
  const file = formData.get('file')
  console.log('File name:', file.name, 'size:', file.size)
}

export default function Form() {
  const b = 1
  async function add(a, formData) {
    'use server'
    // Bind variable, closure variable, and argument.
    redirect('/header?result=' + (a + b + Number(formData.get('n'))))
  }

  async function add3(a, b, c) {
    'use server'
    redirect('/header?result=' + (a + b + c))
  }

  return (
    <>
      <hr />
      <form action={action}>
        <input type="text" name="hidden-info" defaultValue="hi" hidden />
        <input type="text" name="name" id="name" required />
        <button type="submit" id="submit">
          Submit
        </button>
      </form>
      <hr />
      <form>
        <button formAction={nowhere} type="submit" id="nowhere">
          Go nowhere
        </button>
        <button formAction={here} type="submit" id="here">
          Go here
        </button>
      </form>
      <hr />
      <form action={file}>
        <input type="file" name="file" id="file" required />
        <button type="submit" id="upload">
          Upload file
        </button>
      </form>
      <hr />
      <form>
        <input type="text" name="n" id="n" required />
        <button type="submit" id="minus-one" formAction={add.bind(null, -2)}>
          -1
        </button>
      </form>
      <hr />
      <form>
        <button
          type="submit"
          id="add3"
          formAction={add3.bind(null, 1).bind(null, 2).bind(null, 3)}
        >
          add3
        </button>
      </form>
    </>
  )
}
