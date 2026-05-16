import { DynamicComponent } from './client-reference'

globalThis.foo = DynamicComponent

export default function sitemap() {
  return [
    {
      url: 'https://acme.com',
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 1,
    },
  ]
}
