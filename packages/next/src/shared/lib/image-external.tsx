import type { ImageConfigComplete, ImageLoaderProps } from './image-config'
import type { ImageProps, ImageLoader, StaticImageData } from './get-img-props'

import ReactDOM from 'react-dom'
import { getImgProps } from './get-img-props'
import Head from '../../shared/lib/head'
import { Image as ClientImage } from '../../client/image-component'

// @ts-ignore - This is replaced by webpack alias
import defaultLoader from 'next/dist/shared/lib/image-loader'

// This is replaced by webpack define plugin
const imgConf = process.env.__NEXT_IMAGE_OPTS as any as ImageConfigComplete

/**
 * For more advanced use cases, you can call `getImageProps()`
 * to get the props that would be passed to the underlying `<img>` element,
 * and instead pass to them to another component, style, canvas, etc.
 *
 * Read more: [Next.js docs: `getImageProps`](https://nextjs.org/docs/app/api-reference/components/image#getimageprops)
 */
export function getImageProps(imgProps: ImageProps) {
  const { props } = getImgProps(imgProps, {
    defaultLoader,
    // This is replaced by webpack define plugin
    imgConf: process.env.__NEXT_IMAGE_OPTS as any as ImageConfigComplete,
  })
  // Normally we don't care about undefined props because we pass to JSX,
  // but this exported function could be used by the end user for anything
  // so we delete undefined props to clean it up a little.
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) {
      delete props[key as keyof typeof props]
    }
  }
  return { props }
}

export default function Image(imgProps: ImageProps) {
  const { props } = getImgProps(imgProps, { defaultLoader, imgConf })
  if (imgProps.priority) {
    const opts = {
      as: 'image',
      imageSrcSet: props.srcSet,
      imageSizes: props.sizes,
      crossOrigin: props.crossOrigin,
      referrerPolicy: props.referrerPolicy,
      fetchPriority: props.fetchPriority, // TODO: handle fetchpriority Pages Router?
    }

    if (ReactDOM.preload) {
      ReactDOM.preload(
        props.src,
        // @ts-expect-error TODO: upgrade to `@types/react-dom@18.3.x`
        opts
      )
      return <ClientImage {...imgProps} />
    }
    return (
      <>
        <Head>
          <link
            key={'__nimg-' + props.src + props.srcSet + props.sizes}
            rel="preload"
            // Note how we omit the `href` attribute, as it would only be relevant
            // for browsers that do not support `imagesrcset`, and in those cases
            // it would cause the incorrect image to be preloaded.
            //
            // https://html.spec.whatwg.org/multipage/semantics.html#attr-link-imagesrcset
            href={props.srcSet ? undefined : props.src}
            {...opts}
          />
        </Head>
        <ClientImage {...imgProps} />
      </>
    )
  }
  return <ClientImage {...imgProps} />
}

export type { ImageProps, ImageLoaderProps, ImageLoader, StaticImageData }
