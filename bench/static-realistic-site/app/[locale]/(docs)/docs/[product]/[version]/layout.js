import { DOC_VERSIONS } from '../../../../../../lib/content.mjs'

export function generateStaticParams() {
  return DOC_VERSIONS.map((version) => ({ version }))
}

// Docs, level 3: the content next to the `@sidebar` parallel route.
export default function DocsVersionLayout({ children, sidebar }) {
  return (
    <div className="docs-version">
      {sidebar}
      <div className="docs-content">{children}</div>
    </div>
  )
}
