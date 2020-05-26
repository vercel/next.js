//Normalizes our data that we get back from Agility CMS
export function normalizePosts(postsFromAgility) {
  /* Need an object like this...
    - title
    - slug
    - excerpt
    - date
    - coverImage
      - responsiveImage
    - author
      - name
      - picture
          - url
  */

  const posts = postsFromAgility.map((p) => {
    let normalizedPost = {
      title: p.fields.title,
      slug: p.fields.slug,
      excerpt: p.fields.excerpt,
      date: p.fields.date,
      content: p.fields.content,
      ogImage: {
        url: `${p.fields.coverImage.url}?w=2000&h=1000&q=70`,
      },
      coverImage: {
        responsiveImage: {
          srcSet: null,
          webpSrcSet: null,
          sizes: null,
          src: `${p.fields.coverImage.url}?w=2000&h=1000&q=70`,
          width: 2000,
          height: 1000,
          aspectRatio: 100,
          base64: null,
          alt: p.fields.coverImage.label,
          title: null,
          bgColor: null,
        },
      },
    }

    if (p.fields.author) {
      normalizedPost.author = {
        name: p.fields.author.fields.name,
        picture: {
          url: `${p.fields.author.fields.picture.url}?w=100&h=100`,
        },
      }
    }

    return normalizedPost
  })

  return posts
}
