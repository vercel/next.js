import { source } from '@/lib/source'
import {
  DocsPage,
  DocsBody,
  DocsDescription,
  DocsTitle,
  DocsCategory,
} from 'fumadocs-ui/page'
import { notFound } from 'next/navigation'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import Image from 'next/image'
import { Callout } from 'fumadocs-ui/components/callout'
import { Fragment } from 'react'
import { Check, X } from 'lucide-react'
import { Tab, Tabs } from 'fumadocs-ui/components/tabs'

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>
}) {
  const params = await props.params
  const page = source.getPage(params.slug)
  if (!page) notFound()

  let content

  if (page.data.source) {
    const sourcePage = source.getPage(page.data.source.split('/'))

    if (!sourcePage)
      throw new Error(
        `unresolved source in frontmatter of ${page.file.path}: ${page.data.source}`
      )
    content = await sourcePage.data.load()
  } else {
    content = await page.data.load()
  }

  return (
    <DocsPage toc={content.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <content.body
          components={{
            ...defaultMdxComponents,
            blockquote: Callout,
            Tabs,
            Tab,
            Check,
            Cross: X,
            PagesOnly: ({ children }) =>
              page.file.dirname.startsWith('pages') ? (
                <Fragment>{children}</Fragment>
              ) : null,
            AppOnly: ({ children }) =>
              page.file.dirname.startsWith('app') ? (
                <Fragment>{children}</Fragment>
              ) : null,
            Image: (props: {
              srcDark: string
              srcLight: string

              width: string | number
              height: string | number
              alt: string
            }) => (
              <picture>
                <source
                  srcSet={
                    process.env.NODE_ENV === 'development'
                      ? `https://nextjs.org${props.srcDark}`
                      : props.srcDark
                  }
                  media="(prefers-color-scheme: dark)"
                />
                <Image
                  src={
                    process.env.NODE_ENV === 'development'
                      ? `https://nextjs.org${props.srcLight}`
                      : props.srcLight
                  }
                  alt="My image"
                  width={props.width as any}
                  height={props.height as any}
                  className="rounded-lg"
                />
              </picture>
            ),
          }}
        />
        {page.file.name === 'index' && (
          <DocsCategory page={page} from={source} />
        )}
      </DocsBody>
    </DocsPage>
  )
}

export async function generateStaticParams() {
  return source.generateParams()
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>
}) {
  const params = await props.params
  const page = source.getPage(params.slug)
  if (!page) notFound()

  return {
    title: page.data.title,
    description: page.data.description,
  }
}
