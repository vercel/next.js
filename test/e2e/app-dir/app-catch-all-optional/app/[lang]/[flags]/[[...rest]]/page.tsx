export async function generateStaticParams() {
  return [{ lang: 'en', flags: 'us', rest: ['home'] }]
}

export default async function Page(props) {
  const params = await props.params

  return (
    <div>
      <div data-lang={params.lang}>{params.lang}</div>
      <div data-flags={params.flags}>{params.flags}</div>
      <div data-rest={params.rest?.join('/')}>{params.rest?.join('/')}</div>
    </div>
  )
}
