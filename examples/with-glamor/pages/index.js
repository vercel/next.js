import { rehydrate, css } from 'glamor'

// Rehydrate to ensure that the client doesn't duplicate styles
// It has to execute before any code that defines styles
// '__REHYDRATE_IDS' is set in '_document.js'
if (typeof window !== 'undefined') {
  rehydrate(window.__REHYDRATE_IDS)
}

const rule = css({
  color: 'red',
  fontSize: 50,
})

export default function Home() {
  return <h1 {...rule}>My page</h1>
}
