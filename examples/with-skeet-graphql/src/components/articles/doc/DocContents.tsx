import Container from '@/components/common/atoms/Container'
import ScrollSyncToc from '@/components/articles/ScrollSyncToc'
import type { DocContent } from '@/types/article'
import DocPagination from './DocPagination'

type Props = {
  article: DocContent
  articleHtml: string
}

export default function DocContents({ article, articleHtml }: Props) {
  return (
    <>
      <Container>
        <div className="flex justify-center py-12 lg:gap-12">
          <div>
            <h1 className="text-4xl font-bold">{article.title}</h1>

            <div className="py-8 xl:hidden">
              <ScrollSyncToc rawMarkdownBody={article.content} />
            </div>
            <div className="prose break-all py-8 dark:prose-invert lg:prose-lg">
              <div dangerouslySetInnerHTML={{ __html: articleHtml }} />
            </div>
            <div className="py-16">
              <DocPagination />
            </div>
          </div>
          <div className="relative hidden pt-24 xl:block">
            <ScrollSyncToc rawMarkdownBody={article.content} />
          </div>
        </div>
      </Container>
    </>
  )
}
