export function absoluteURL(url) {
  return `${process.env.NEXT_PUBLIC_DRUPAL_BASE_URL}${url}`
}
