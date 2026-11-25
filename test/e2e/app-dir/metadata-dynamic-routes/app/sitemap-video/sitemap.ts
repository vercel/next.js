import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://example.com/about',
      videos: [
        {
          title: 'example',
          thumbnail_loc: 'https://example.com/image.jpg',
          description: 'this is the description',
          content_loc: 'http://streamserver.example.com/video123.mp4',
          player_loc: 'https://www.example.com/videoplayer.php?video=123',
          duration: 2,
          view_count: 50,
          tag: 'summer',
          rating: 4,
          expiration_date: new Date('2025-09-16T20:00:00+02:00'),
          publication_date: new Date('2024-09-16T12:34:56.789Z'),
          family_friendly: 'yes',
          requires_subscription: 'no',
          live: 'no',
          restriction: {
            relationship: 'allow',
            content: 'IE GB US CA',
          },
          platform: {
            relationship: 'allow',
            content: 'web',
          },
          uploader: {
            info: 'https://www.example.com/users/grillymcgrillerson',
            content: 'GrillyMcGrillerson',
          },
        },
      ],
    },
  ]
}
