import { font } from './font'

export default function Home() {
  return (
    <div>
      <p>Home</p>
      <p id="with-font" className={font.className}>
        Text with custom font
      </p>
    </div>
  )
}
