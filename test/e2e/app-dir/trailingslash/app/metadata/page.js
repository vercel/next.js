export default function Page() {
  return 'page'
}

export const metadata = {
  openGraph: {
    // external url with different domain
    url: 'http://trailingslash-another.com/metadata',
  },
  alternates: {
    // relative url with query string
    canonical: '/metadata?query=string',
  },
}
