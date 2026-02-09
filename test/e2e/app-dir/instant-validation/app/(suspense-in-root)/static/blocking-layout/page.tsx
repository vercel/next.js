export const unstable_instant = { prefetch: 'static' }

export default async function Page() {
  return (
    <main>
      <p>This is a static page below a blocking layout</p>
    </main>
  )
}
