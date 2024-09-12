import { setTimeout } from 'timers/promises'

export default async function Page({ params }) {
  await setTimeout(1000)

  return <div data-slug={params.slug}>{params.slug}</div>
}
