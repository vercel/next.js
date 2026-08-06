// import { setTimeout } from 'timers/promises'

export default async function Page(props) {
  const params = await props.params
  // await setTimeout(1000)

  return <div data-slug={params.slug.join('/')}>{params.slug.join('/')}</div>
}
