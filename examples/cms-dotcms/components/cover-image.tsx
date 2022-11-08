import DotCmsImage from './dotcms-image'
import Link from 'next/link'
import cn from 'classnames'

export default function CoverImage(props) {
  const image = (
    <DotCmsImage
      {...props}
      alt={`Cover Image for ${props.title}`}
      className={cn('shadow-small', {
        'hover:shadow-medium transition-shadow duration-200': props.slug,
      })}
    />
  )

  return (
    <div className="-mx-5 sm:mx-0">
      {props.slug ? (
        <Link href={`/posts/${props.slug}`} aria-label={props.title}>
          {image}
        </Link>
      ) : (
        image
      )}
    </div>
  )
}
