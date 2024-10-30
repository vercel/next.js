import { setTimeout } from 'timers/promises'

export default async function Page(props) {
  const { slug } = await props.params
  await setTimeout(1000)

  return (
    <div>
      <div data-slug={slug}>{slug}</div>
      This page should be static
    </div>
  )
}
