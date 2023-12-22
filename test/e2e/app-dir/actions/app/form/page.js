async function action(formData) {
  'use server'
  const payload = formData.get('payload').toString()
  console.log('size =', payload.length)
}

export default function Page() {
  return (
    <>
      <form action={action}>
        <input
          type="hidden"
          name="payload"
          value={'a'.repeat(1024 * 1024 * 1)}
        />
        <button type="submit" id="size-1mb">
          SUBMIT 1mb
        </button>
      </form>
      <form action={action}>
        <input
          type="hidden"
          name="payload"
          value={'a'.repeat(1024 * 1024 * 2)}
        />
        <button type="submit" id="size-2mb">
          SUBMIT 2mb
        </button>
      </form>
      <form action={action}>
        <input
          type="hidden"
          name="payload"
          value={'a'.repeat(1024 * 1024 * 3)}
        />
        <button type="submit" id="size-3mb">
          SUBMIT 3mb
        </button>
      </form>
    </>
  )
}
