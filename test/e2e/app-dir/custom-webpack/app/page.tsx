import { message } from './message'

export default function Page() {
  return (
    <main>
      <p id="webpack-version">{process.env.CUSTOM_WEBPACK_PLUGIN_VALUE}</p>
      <p id="replacement-message">{message}</p>
    </main>
  )
}
