import React from 'react'
import { ArticleJsonLd } from 'next-seo'

// See all available JSON-LD here:
// https://github.com/garmeeh/next-seo#json-ld
export default () => (
  <div>
    <ArticleJsonLd
      url='https://example.com/article'
      title='Article headline'
      images={[
        'https://example.com/photos/1x1/photo.jpg',
        'https://example.com/photos/4x3/photo.jpg',
        'https://example.com/photos/16x9/photo.jpg'
      ]}
      datePublished='2015-02-05T08:00:00+08:00'
      dateModified='2015-02-05T09:00:00+08:00'
      authorName='Jane Blogs'
      publisherName='Mary Blogs'
      publisherLogo='https://www.example.com/photos/logo.jpg'
      description='This is a mighty good description of this article.'
    />
    <h1>JSON-LD Added to Page</h1>
    <p>
      Take a look at the head to see what has been added, you are looking for a
      script tag of type "application/ld+json".
    </p>
  </div>
)
