import { setTimeout } from 'timers/promises'

export default async function Page(props) {
  const params = await props.params
  await setTimeout(1000)

  const { slug } = params

  return (
    <div>
      <div data-slug={slug}>{slug}</div>
      This page should be static
    </div>
  )
}
