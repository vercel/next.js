import Script from "next/script";

export default function ImplicitRender() {
  return (
    <main>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        async={true}
        defer={true}
      />
      <form method="POST" action="/api/handler">
        <h2>Dummy Login Demo</h2>
        <div
          className="cf-turnstile checkbox"
          data-sitekey={process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY}
        />
        <button type="submit">Sign in</button>
        <p>
          Go to the <a href="/explicit">explicit render demo</a>
        </p>
      </form>
    </main>
  );
}
