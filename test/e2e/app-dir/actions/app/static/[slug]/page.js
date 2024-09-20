import { Button } from './button'

export default function Page() {
  return (
    <>
      <p>/static/[slug]</p>
      <Button />
    </>
  )
}

export function generateStaticParams() {
  return [
    {
      slug: 'first',
    },
  ]
}
