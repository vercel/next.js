'use client'
import { useEffect, useState } from 'react'

// Reports two things for the test to assert on:
//
// 1. Whether any malicious injected `<script>` executed. Each would set a
//    `__xss*` global from its `</script><script>...</script>` break-out.
// 2. Whether each legitimate beforeInteractive `<Script>` actually ran AND,
//    for the inline ones, that the HTML-escape round-trip preserved the
//    source verbatim. The inline scripts store the value of an expression
//    containing `<`, `>`, or `&` — any corruption would either throw or
//    produce a non-true value and the proof global would fail the `=== true`
//    check. The external-src script only needs to confirm it loaded, so it
//    uses a plain flag (`__loadedSrc`).
//
// Each result is both rendered as human-readable text for debugging and
// exposed as a boolean `data-*` attribute for simple per-result querying
// from tests.
type Report = {
  xssInlineInnerHTML: boolean
  xssInlineChildren: boolean
  xssSrc: boolean
  escapeProofInlineInnerHTML: boolean
  escapeProofInlineChildren: boolean
  loadedSrc: boolean
}

export function PwnDetector() {
  const [report, setReport] = useState<Report | null>(null)
  useEffect(() => {
    setReport({
      xssInlineInnerHTML: (window as any).__xssInlineInnerHTML === true,
      xssInlineChildren: (window as any).__xssInlineChildren === true,
      xssSrc: (window as any).__xssSrc === true,
      escapeProofInlineInnerHTML:
        (window as any).__escapeProofInlineInnerHTML === true,
      escapeProofInlineChildren:
        (window as any).__escapeProofInlineChildren === true,
      loadedSrc: (window as any).__loadedSrc === true,
    })
  }, [])

  if (!report) {
    return (
      <section data-testid="xss-status" data-ready="false">
        checking…
      </section>
    )
  }

  const row = (label: string, xss: boolean, legit: boolean) => (
    <tr>
      <td>{label}</td>
      <td>{xss ? 'yes (XSS fired)' : 'no'}</td>
      <td>{legit ? 'yes' : 'no'}</td>
    </tr>
  )

  return (
    <section
      data-testid="xss-status"
      data-ready="true"
      data-xss-inline-innerhtml={String(report.xssInlineInnerHTML)}
      data-xss-inline-children={String(report.xssInlineChildren)}
      data-xss-src={String(report.xssSrc)}
      data-escape-proof-inline-innerhtml={String(
        report.escapeProofInlineInnerHTML
      )}
      data-escape-proof-inline-children={String(
        report.escapeProofInlineChildren
      )}
      data-loaded-src={String(report.loadedSrc)}
    >
      <h2>next/script beforeInteractive — XSS detector</h2>
      <table>
        <thead>
          <tr>
            <th>script</th>
            <th>injected payload executed?</th>
            <th>legit body ran (and unmangled)?</th>
          </tr>
        </thead>
        <tbody>
          {row(
            'inline (dangerouslySetInnerHTML)',
            report.xssInlineInnerHTML,
            report.escapeProofInlineInnerHTML
          )}
          {row(
            'inline (children)',
            report.xssInlineChildren,
            report.escapeProofInlineChildren
          )}
          {row('external (src)', report.xssSrc, report.loadedSrc)}
        </tbody>
      </table>
    </section>
  )
}
