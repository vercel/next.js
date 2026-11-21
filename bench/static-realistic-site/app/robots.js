export default function robots() {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/api/', '/search'] },
      { userAgent: 'BadBot', disallow: '/' },
    ],
    sitemap: 'https://bench-static-realistic-site.example/sitemap.xml',
    host: 'https://bench-static-realistic-site.example',
  }
}
