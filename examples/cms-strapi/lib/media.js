export function getStrapiMedia(image) {
  return `${
    image.url.startsWith('/') ? process.env.NEXT_PUBLIC_STRAPI_API_URL : ''
  }${image.url}`
}
