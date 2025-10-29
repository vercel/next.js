import defaultMdxComponents from 'fumadocs-ui/mdx'
import type { MDXComponents } from 'mdx/types'
import NextImage, { type ImageProps } from 'next/image'
import { ReactNode } from 'react'

const IMAGE_BASE_URL = ''

const genericComponents = {
  Image: (
    props: ImageProps & {
      srcLight?: string
      srcDark?: string
      alt?: string
      caption?: string
      src?: string
    }
  ) => {
    const {
      src,
      srcLight,
      srcDark,
      caption,
      alt = caption || '',
      ...rest
    } = props

    const hasThemeVariants = srcLight && srcDark
    const sharedClasses = 'rounded-md border border-gray-200 bg-gray-100'

    return (
      <figure>
        {/* Image variants (srcLight and srcDark) provided */}
        {hasThemeVariants ? (
          <>
            <NextImage
              className={`${sharedClasses} dark:hidden`}
              {...rest}
              alt={alt}
              src={IMAGE_BASE_URL + srcLight}
            />
            <NextImage
              className={`${sharedClasses} hidden dark:block`}
              {...rest}
              alt={alt}
              src={IMAGE_BASE_URL + srcDark}
            />
          </>
        ) : (
          /* Only src provided - show in both themes */
          <NextImage
            className={sharedClasses}
            {...rest}
            alt={alt}
            src={IMAGE_BASE_URL + src}
          />
        )}

        {caption ? <figcaption>{caption}</figcaption> : null}
      </figure>
    )
  },

  Check: ({ size }: { size: number }) => (
    <span className="inline-flex align-middle text-green-600">&#10003;</span>
  ),
  Cross: ({ size }: { size: number }): ReactNode => (
    <span className="inline-flex align-middle text-gray-900">&#10060;</span>
  ),
}

// use this function to get MDX components, you will need it for rendering MDX
export function getMDXComponents(
  components?: MDXComponents,
  opts?: { isApp?: boolean; isPages?: boolean }
): MDXComponents {
  const isApp = opts?.isApp
  const isPages = opts?.isPages

  return {
    ...defaultMdxComponents,
    ...genericComponents,
    AppOnly: ({ children }: { children: ReactNode }): ReactNode =>
      isApp ? children : null,
    PagesOnly: ({ children }: { children: ReactNode }): ReactNode =>
      isPages ? children : null,
    ...components,
  }
}
