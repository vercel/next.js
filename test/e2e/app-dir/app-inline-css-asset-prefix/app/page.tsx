import { font } from './font'

export default function Page() {
  return (
    <div>
      <p id="with-font" className={font.className}>
        Text with next/font/local
      </p>
      <p id="global-css-font">Text with @font-face from global css</p>
    </div>
  )
}
