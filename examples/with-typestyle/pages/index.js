import { style } from 'typestyle'

const className = style({ color: 'red' })
const RedText = ({ text }) => <div className={className}>{text}</div>

export default function Home() {
  return <RedText text="Hello Next.js!" />
}
