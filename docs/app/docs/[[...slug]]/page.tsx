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

  const { body: MDX, toc } = await page.data.load()

  return (
    <DocsPage toc={toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={{
            ...defaultMdxComponents,
            blockquote: Callout,
            Tabs,
            Tab,
            Check,
            Cross: X,
            PagesOnly: ({ children }) => <Fragment>{children}</Fragment>,
            AppOnly: ({ children }) => <Fragment>{children}</Fragment>,
            Image: (props: {
              srcDark: string
              srcLight: string

              width: string | number
              height: string | number
              alt: string
            }) => (
              <picture>
                <source
                  srcSet={props.srcDark}
                  media="(prefers-color-scheme: dark)"
                />
                <Image
                  src={props.srcLight}
                  alt="My image"
                  width={props.width as any}
                  height={props.height as any}
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
