import type { ReactElement } from 'react'
import type {
  GetStaticProps,
  InferGetStaticPropsType,
  GetStaticPaths,
} from 'next'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remark2Rehype from 'remark-rehype'
import rehypeHighlight from 'rehype-highlight'
import rehypeStringify from 'rehype-stringify'
import rehypeCodeTitles from 'rehype-code-titles'
import remarkSlug from 'remark-slug'
import remarkGfm from 'remark-gfm'
import remarkDirective from 'remark-directive'
import remarkExternalLinks from 'remark-external-links'

import { getAllArticles, getArticleBySlug } from '@/utils/article'
import DocLayout from '@/layouts/doc/DocLayout'
import { getI18nProps } from '@/lib/getStatic'
import DocContents from '@/components/articles/doc/DocContents'

const articleDirName = 'doc'

export default function Doc({
  article,
  articleHtml,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <>
      <DocContents article={article} articleHtml={articleHtml} />
    </>
  )
}

Doc.getLayout = function getLayout(page: ReactElement) {
  return <DocLayout>{page}</DocLayout>
}

const articleDirPrefix = `articles/${articleDirName}/`

export const getStaticProps: GetStaticProps = async (ctx) => {
  const { params } = ctx
  if (params?.slug == null)
    return {
      props: {
        article: {
          title: '',
          description: '',
          content: '',
        },
      },
    }

  const article = getArticleBySlug(
    typeof params.slug == 'string' ? [params.slug] : params.slug,
    ['title', 'description', 'content'],
    articleDirPrefix,
    (params.locale as string) ?? 'en'
  )
  console.log(article.content)

  const articleHtml = await unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(remarkGfm)
    .use(remarkSlug)
    .use(remarkExternalLinks, {
      target: '_blank',
      rel: ['noopener noreferrer'],
    })
    .use(remark2Rehype)
    .use(rehypeCodeTitles)
    .use(rehypeHighlight)
    .use(rehypeStringify)
    .process(article.content as string)

  const slug = params.slug as string[]
  const pathname = `/${articleDirName}/${slug.join('/')}`

  const seo = {
    pathname,
    title: {
      ja: article.title as string,
      en: article.title as string,
    },
    description: {
      ja: `${article.description}`,
      en: `${article.description}`,
    },
    img: null,
  }

  return {
    props: {
      article,
      articleHtml: articleHtml.value,
      ...(await getI18nProps(ctx, ['common', articleDirName], seo)),
    },
  }
}

export const getStaticPaths: GetStaticPaths = async () => {
  const articles = getAllArticles(articleDirPrefix)
  return {
    paths: articles.map((article) => {
      if (article[0] === 'ja') {
        return {
          params: {
            slug: article.filter((_, index) => index !== 0),
            locale: 'ja',
          },
        }
      }
      return {
        params: {
          slug: article.filter((_, index) => index !== 0),
          locale: 'en',
        },
      }
    }),
    fallback: false,
  }
}
