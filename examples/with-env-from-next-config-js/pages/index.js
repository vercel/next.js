export default function Home() {
  return (
    <div>
      RESTURL_SPEAKERS {process.env.RESTURL_SPEAKERS}
      <br />
      RESTURL_SESSIONS {process.env.RESTURL_SESSIONS}
    </div>
  )
}
