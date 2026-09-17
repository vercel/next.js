export default function Page() {
  async function subscribe(formData: FormData) {
    'use server'
    const email = String(formData.get('email') || '')
    return email
  }

  return (
    <>
      <header>
        <nav>Site nav</nav>
      </header>
      <main>
        <h1>About</h1>
        <p>
          This page is converted automatically because it has no{' '}
          <code>page.md</code>.
        </p>
        <form
          action={subscribe}
          data-agent-action="subscribe"
          data-agent-summary="Subscribe the given email to updates"
        >
          <input type="email" name="email" required />
          <button type="submit">Subscribe</button>
        </form>
      </main>
      <footer>Footer chrome</footer>
    </>
  )
}
