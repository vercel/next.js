import { getSite, read } from '@bench/data'

export const metadata = { title: 'About' }

export default async function AboutPage({ params }) {
  const { locale } = await read(params)
  const site = await getSite(locale)
  return (
    <article className="about">
      <h1>About {site.name}</h1>
      <p>{site.tagline}</p>
      <p>{site.announcement}</p>
    </article>
  )
}
