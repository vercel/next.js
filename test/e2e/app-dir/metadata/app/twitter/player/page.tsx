export default function page() {
  return 'twitter player'
}

export const metadata = {
  twitter: {
    card: 'player',
    title: 'Twitter Title',
    description: 'Twitter Description',
    siteId: 'siteId',
    creator: 'creator',
    creatorId: 'creatorId',
    images: 'https://twitter.com/image.png',
    players: {
      playerUrl: 'https://twitter.com/player',
      streamUrl: 'https://twitter.com/stream',
      width: 100,
      height: 100,
    },
  },
}
