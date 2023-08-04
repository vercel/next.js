import type { GetStaticProps, InferGetStaticPropsType } from 'next'
import type { ReactElement } from 'react'
import DefaultLayout from '@/layouts/default/DefaultLayout'
import { getStaticPaths } from '@/lib/getStatic'

import { getAllArticles, getArticleBySlug } from '@/utils/article'
import { getI18nProps } from '@/lib/getStatic'
import NewsIndex from '@/components/articles/news/NewsIndex'

const articleDirName = 'news'

const seo = {
  pathname: `/${articleDirName}`,
  title: {
    ja: 'ニュース',
    en: 'News',
  },
  description: {
    ja: 'ニュース',
    en: 'News',
  },
  img: null,
}

export default function NewsIndexPage({
  urls,
  articles,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <>
      <NewsIndex urls={urls} articles={articles} />
    </>
  )
}

NewsIndexPage.getLayout = function getLayout(page: ReactElement) {
  return <DefaultLayout>{page}</DefaultLayout>
}

const articleDirPrefix = `articles/${articleDirName}/`

export const getStaticProps: GetStaticProps = async (ctx) => {
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

  const urls = slugs
    .map(
      (slug) => `/${articleDirName}/${slug[1]}/${slug[2]}/${slug[3]}/${slug[4]}`
    )
    .reverse()

  return {
    props: {
      urls,
      articles,
      ...(await getI18nProps(ctx, ['common', articleDirName], seo)),
    },
  }
}

export { getStaticPaths }
