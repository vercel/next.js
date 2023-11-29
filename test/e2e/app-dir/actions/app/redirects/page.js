export default function Home() {
  return (
    <main id="redirect-page">
      <h1>POST /api-redirect (`redirect()`)</h1>
      <form action="/redirects/api-redirect" method="POST">
        <input type="submit" value="Submit" id="submit-api-redirect" />
      </form>
      <h1>POST /api-redirect-permanent (`permanentRedirect()`)</h1>
      <form action="/redirects/api-redirect-permanent" method="POST">
        <input
          type="submit"
          value="Submit"
          id="submit-api-redirect-permanent"
        />
      </form>
    </main>
  )
}
