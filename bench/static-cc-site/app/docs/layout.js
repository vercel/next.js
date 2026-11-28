import { cacheLife, cacheTag } from 'next/cache'
import { DocsSidebar } from '../../../static-isr-site/components/client/site-ui'
import { getDocsNavigation } from '../../lib/cms'

// A cached layout: the entry holds the rendered sidebar (a client component
// reference with its props) and passes `children` through untouched.
export default async function DocsLayout({ children }) {
  'use cache'
  cacheLife('days')
  cacheTag('docs')
  const sections = await getDocsNavigation()
  return (
    <div className="docs">
      <DocsSidebar sections={sections} />
      <div className="docs-content">{children}</div>
    </div>
  )
}
