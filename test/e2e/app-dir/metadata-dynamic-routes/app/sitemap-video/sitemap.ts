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
          expiration_date: '2025-09-16',
          publication_date: '2024-09-16',
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
