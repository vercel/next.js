import { paragraph, rng } from '../../lib/rng'

export const metadata = {
  title: 'About',
  description: 'Who we are and how we work.',
  alternates: { canonical: '/about' },
}

export default function AboutPage() {
  const r = rng('about')
  return (
    <article>
      <h1>About Northfold Supply</h1>
      {[0, 1, 2, 3].map((i) => (
        <p key={i}>{paragraph(r, 4, 6)}</p>
      ))}
    </article>
  )
}
