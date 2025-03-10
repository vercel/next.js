export async function generateStaticParams() {
  return []
}

export default async function Page(props) {
  const params = await props.params

  return (
    <div>
      <div data-lang={params.lang}>{params.lang}</div>
      <div data-flags={params.flags}>{params.flags}</div>
      <div data-slug={params.slug}>{params.slug}</div>
    </div>
  )
}
