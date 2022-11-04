import { style } from 'typestyle'

const className = style({ color: 'red' })

export default function Home() {
  return <div className={className}>Hello Next.js!</div>
}
