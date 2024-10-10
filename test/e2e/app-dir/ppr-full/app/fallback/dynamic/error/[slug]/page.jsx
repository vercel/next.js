import { setTimeout } from 'timers/promises'

export default async function Page(props) {
  await setTimeout(1000)

  const { slug } = await props.params

  return (
    <div>
      <div data-slug={slug}>{slug}</div>
      This page should be static
    </div>
  )
}
