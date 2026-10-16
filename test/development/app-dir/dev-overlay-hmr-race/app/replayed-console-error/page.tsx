// React replays this server log on the client while decoding the navigation's
// Flight response.
export default function Page() {
  console.error('replayed server console error')
  return <p id="replayed-console-error">replayed console error</p>
}
