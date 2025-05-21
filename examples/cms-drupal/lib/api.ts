export function absoluteURL(url: string): string {
  return `${process.env.NEXT_PUBLIC_DRUPAL_BASE_URL}${url}`;
}
