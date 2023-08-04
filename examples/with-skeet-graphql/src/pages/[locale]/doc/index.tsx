import type { GetStaticProps, InferGetStaticPropsType } from 'next'
import type { ReactElement } from 'react'
import DocLayout from '@/layouts/doc/DocLayout'
import { getStaticPaths } from '@/lib/getStatic'
import { getI18nProps } from '@/lib/getStatic'
import DocIndex from '@/components/articles/doc/DocIndex'

const articleDirName = 'doc'

const seo = {
  pathname: `/${articleDirName}`,
  title: {
    ja: 'ドキュメントトップページ',
    en: 'Doc top page',
  },
  description: {
    ja: 'Next.js Template ドキュメントトップページ',
    en: 'Next.js Doc top page',
  },
  img: null,
}

export default function DocIndexPage() {
  return (
    <>
      <DocIndex />
    </>
  )
}

DocIndexPage.getLayout = function getLayout(page: ReactElement) {
  return <DocLayout>{page}</DocLayout>
}

export const getStaticProps: GetStaticProps = async (ctx) => {
  return {
    props: {
      ...(await getI18nProps(ctx, ['common', articleDirName], seo)),
    },
  }
}

export { getStaticPaths }
