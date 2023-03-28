export default function page() {
  return 'twitter summary_large_image'
}

export const metadata = {
  twitter: {
    card: 'summary_large_image',
    title: 'Twitter Title',
    description: 'Twitter Description',
    siteId: 'siteId',
    creator: 'creator',
    creatorId: 'creatorId',
    images: {
      url: 'https://twitter.com/image.png',
      alt: 'image-alt',
    },
  },
}
