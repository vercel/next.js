import Script from 'next/script'
import { PwnDetector } from './xss-detector'

// Regression fixture for HTML-escaping of the inline __next_s payload that
// Next.js emits for `beforeInteractive` scripts. Any string prop forwarded
// through `restProps` (here `data-tracking-id`, but `id` and any other
// attribute are equivalent) reaches the inline <script> body via
// JSON.stringify. Without HTML escaping, a value like
// `</script><script>...</script>` breaks out of the script element at the
// HTML tokenizer level, executes, and the fingerprint it leaves on `window`
// is picked up by <PwnDetector />.
export default function Page() {
  return (
    <div>
      <Script
        id="inline-innerhtml-xss"
        strategy="beforeInteractive"
        data-tracking-id="</script><script>window.__xssInlineInnerHTML=true</script>"
        dangerouslySetInnerHTML={{
          // The body evaluates a `<` comparison so the global doubles as proof
          // of both "did this run" and "did the HTML-escape preserve the `<`".
          // Any regression that mangled `<` would make the expression throw or
          // evaluate to a non-true value, and the proof global would not be
          // strictly equal to `true`.
          __html: `window.__escapeProofInlineInnerHTML = 1 < 2;console.log('running innerhtml script');`,
        }}
      />
      <Script
        id="inline-children-xss"
        strategy="beforeInteractive"
        data-tracking-id="</script><script>window.__xssInlineChildren=true</script>"
      >
        {/* Same idea, exercising `>` and `&&` (contains `&`). */}
        {`window.__escapeProofInlineChildren = 2 > 1 && 3 > 2;console.log('running children script');`}
      </Script>
      <Script
        id="src-xss"
        strategy="beforeInteractive"
        src="/xss-src.js"
        data-tracking-id="</script><script>window.__xssSrc=true</script>"
      />
      <PwnDetector />
    </div>
  )
}
