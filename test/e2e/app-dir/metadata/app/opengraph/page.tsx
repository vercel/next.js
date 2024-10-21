export default function Page() {
  return 'opengraph'
}

export const metadata = {
  openGraph: {
    title: 'My custom title',
    description: 'My custom description',
    url: 'https://example.com',
    siteName: 'My custom site name',
    images: [
      {
        url: 'https://example.com/image.png',
        width: 800,
        height: 600,
      },
      {
        url: 'https://example.com/image2.png',
        width: 1800,
        height: 1600,
        alt: 'My custom alt',
      },
    ],
    videos: [
      {
        url: 'https://example.com/video.mp4',
        width: 800,
        height: 450,
      },
    ],
    audio: [
      {
        url: 'https://example.com/audio.mp3',
      },
    ],
    locale: 'en-US',
    type: 'website',
  },
}
