import { getDocsTree, read } from '@bench/data'
import { DocsSidebar } from '../../../../../../../../../components/client/content'
import { counts } from '../../../../../../../../../lib/content.mjs'

// The sidebar of a docs page, as a parallel route: the tree of the product
// version with the current topic marked.
export default async function Sidebar({ params }) {
  const { locale, product, version, section, topic } = await read(params)
  const tree = await getDocsTree(locale, product, version, counts().docs)
  return (
    <DocsSidebar
      tree={tree}
      current={`/${locale}/docs/${product}/${version}/${section}/${topic}`}
    />
  )
}
