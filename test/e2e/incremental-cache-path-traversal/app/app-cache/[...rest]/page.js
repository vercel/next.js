export const revalidate = 3600

export function generateStaticParams() {
  return [{ rest: ['seed'] }]
}

export default async function AppCachePage({ params }) {
  const { rest } = await params
  const captured = `ordinary-bound-value:${rest.join('/')}`

  // A closure-bound "use server" action. Its presence makes `next build` emit
  // server-reference-manifest.json (with an encryptionKey), which is the private
  // file the traversal later discloses.
  async function harmlessBoundAction(formData) {
    'use server'
    return `${captured}:${formData.get('value')}`
  }

  return (
    <main>
      <p id="app-rest">{rest.join('/')}</p>
      <form action={harmlessBoundAction}>
        <input name="value" defaultValue="harmless" />
        <button type="submit">submit</button>
      </form>
    </main>
  )
}
