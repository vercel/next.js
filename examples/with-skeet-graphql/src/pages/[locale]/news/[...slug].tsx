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
import DefaultLayout from '@/layouts/default/DefaultLayout'
import { getI18nProps } from '@/lib/getStatic'
import NewsContents from '@/components/articles/news/NewsContents'
import NewsPageIndex from '@/components/articles/news/NewsPageIndex'

const articleDirName = 'news'

export default function News({
  article,
  articleHtml,
  urls,
  articles,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <>
      <NewsContents article={article} articleHtml={articleHtml} />
      <NewsPageIndex urls={urls} articles={articles} />
    </>
  )
}

News.getLayout = function getLayout(page: ReactElement) {
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
          category: '',
          thumbnail: '',
          content: '',
          date: '',
        },
      },
    }

  const article = getArticleBySlug(
    typeof params.slug == 'string' ? [params.slug] : params.slug,
    ['title', 'category', 'thumbnail', 'content', 'date', 'id'],
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
    .use(rehypeCodeTitles)
    .use(rehypeHighlight)
    .use(rehypeStringify)
    .process(article.content as string)

  const slugs = getAllArticles(articleDirPrefix).filter(
    (article) => article[0] !== 'ja'
  )
  const articles = slugs
    .map((slug) =>
      getArticleBySlug(
        slug.filter((_, index) => index !== 0),
        ['title', 'category', 'thumbnail', 'date', 'content'],
        articleDirPrefix,
        (ctx.params?.locale as string) ?? 'en'
      )
    )
    .reverse()
    .slice(0, 3)

  const urls = slugs
    .map(
      (slug) => `/${articleDirName}/${slug[1]}/${slug[2]}/${slug[3]}/${slug[4]}`
    )
    .reverse()
    .slice(0, 3)

  const slug = params.slug as string[]
  const pathname = `/${articleDirName}/${slug.join('/')}`

  const seo = {
    pathname,
    title: {
      ja: article.title as string,
      en: article.title as string,
    },
    description: {
      ja: `${article.content.slice(0, 120)} ...`,
      en: `${article.content.slice(0, 120)} ...`,
    },
    img: article.thumbnail as string,
  }

  return {
    props: {
      urls,
      articles,
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
