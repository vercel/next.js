export default function HomeLayout({
  form,
  renders,
}: {
  form: React.ReactNode
  renders: React.ReactNode
}) {
  return (
    <section className="lg:overflow-y-hidden">
      <section className="grid h-full min-h-screen grid-cols-1 gap-4 lg:grid-cols-[400px,1fr]">
        <aside
          id="form"
          className="flex h-full items-center justify-center overflow-y-auto overflow-x-hidden border"
        >
          {form}
        </aside>
        <article
          id="renders"
          className="flex h-full items-center justify-center overflow-y-auto border"
        >
          {renders}
        </article>
      </section>
    </section>
  )
}
