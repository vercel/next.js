import Script from 'next/script'

type RenderParameters = {
  sitekey: string
  theme?: 'light' | 'dark'
  callback?(token: string): void
}

declare global {
  interface Window {
    onloadTurnstileCallback(): void
    turnstile: {
      render(container: string | HTMLElement, params: RenderParameters): void
    }
  }
}

export default function ExplicitRender() {
  return (
    <main>
      <Script id="cf-turnstile-callback">
        {`window.onloadTurnstileCallback = function () {
          window.turnstile.render('#my-widget', {
            sitekey: '${process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY}',
          })
        }`}
      </Script>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback"
        async={true}
        defer={true}
      />
      <form method="POST" action="/api/handler">
        <h2>Dummy Login Demo</h2>
        <div id="my-widget" className="checkbox" />
        <button type="submit">Sign in</button>
        <p>
          Go to the <a href="/implicit">implicit render demo</a>
        </p>
      </form>
    </main>
  )
}
