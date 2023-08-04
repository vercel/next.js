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
import remarkSlug from 'remark-slug'
import remarkGfm from 'remark-gfm'
import remarkDirective from 'remark-directive'
import remarkExternalLinks from 'remark-external-links'

import { getAllArticles, getArticleBySlug } from '@/utils/article'
import DefaultLayout from '@/layouts/default/DefaultLayout'
import { getI18nProps } from '@/lib/getStatic'
import LegalContents from '@/components/articles/legal/LegalContents'

const articleDirName = 'legal'

export default function Legal({
  article,
  articleHtml,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <>
      <LegalContents article={article} articleHtml={articleHtml} />
    </>
  )
}

Legal.getLayout = function getLayout(page: ReactElement) {
  return <DefaultLayout>{page}</DefaultLayout>
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
    ['title', 'description', 'content', 'id'],
    articleDirPrefix,
    (params.locale as string) ?? 'en'
  )

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
    .use(rehypeHighlight)
    .use(rehypeStringify)
    .process(article.content as string)

  const seo = {
    pathname: `/${articleDirName}/${article.id}`,
    title: {
      ja: article.title as string,
      en: article.title as string,
    },
    description: {
      ja: article.description as string,
      en: article.description as string,
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
