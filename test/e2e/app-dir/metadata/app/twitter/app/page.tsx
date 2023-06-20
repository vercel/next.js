export default function page() {
  return 'twitter app'
}

export const metadata = {
  twitter: {
    card: 'app',
    title: 'Twitter Title',
    description: 'Twitter Description',
    siteId: 'siteId',
    creator: 'creator',
    creatorId: 'creatorId',
    images: [
      'https://twitter.com/image-100x100.png',
      'https://twitter.com/image-200x200.png',
    ],
    app: {
      name: 'twitter_app',
      id: {
        iphone: 'twitter_app://iphone',
        ipad: 'twitter_app://ipad',
        googleplay: 'twitter_app://googleplay',
      },
      url: {
        iphone: 'https://iphone_url',
        ipad: 'https://ipad_url',
      },
    },
  },
}
