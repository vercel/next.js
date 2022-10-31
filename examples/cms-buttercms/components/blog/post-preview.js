import Image from 'next/image'
import Link from 'next/link'

import HumanDate from '@/components/human-date'
import AuthorCard from '@/components/author-card'

export default function PostsPreview({
  title,
  coverImage,
  coverImageAlt,
  date,
  author,
  tags,
  excerpt,
  slug,
}) {
  return (
    <div className="col-12 col-lg-6">
      <div className="blog-roll-card">
        <div className="blog-roll-card-meta">
          <h2 className="blog-roll-card-header">
            <Link href={`/blog/${slug}`}>{title}</Link>
          </h2>
          <ul className="blog-roll-card-meta-info">
            <li>
              <AuthorCard author={author} />
            </li>
            <li>
              <i className="lni lni-calendar"></i>{' '}
              <HumanDate dateString={date} />
            </li>
            {tags.map((tag) => (
              <li key={tag.slug}>
                <Link href={`/blog/tag/${tag.slug}`}>
                  <i className="lni lni-tag"></i> {tag.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        {coverImage && (
          <div className="single-post-thumbnail">
            <Image
              src={coverImage}
              alt={coverImageAlt}
              layout="fill"
              objectFit="cover"
            />
          </div>
        )}
        <div
          className="blog-roll-card-body prose"
          dangerouslySetInnerHTML={{ __html: excerpt }}
        ></div>
        <div className="blog-roll-card-footer text-center">
          <Link href={`/blog/${slug}`} className="main-btn btn-hover">
            Read More
          </Link>
        </div>
      </div>
    </div>
  )
}
