import { font1 } from 'my-font'

export default function HomePage() {
  return (
    <p id="third-party-page" className={font1.className}>
      {JSON.stringify(font1)}
    </p>
  )
}
