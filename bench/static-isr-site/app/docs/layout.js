import { DocsSidebar } from '../../components/client/site-ui'
import { getDocsNavigation } from '../../lib/data'

export default async function DocsLayout({ children }) {
  const sections = await getDocsNavigation()
  return (
    <div className="docs">
      <DocsSidebar sections={sections} />
      <div className="docs-content">{children}</div>
    </div>
  )
}
