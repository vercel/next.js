import { LinkAccordion } from '../components/link-accordion'

export default function NotFound() {
  return (
    <main id="blog-not-found">
      <p>Blog category not found</p>
      <LinkAccordion href="/blog" prefetch={false}>
        Visit all posts
      </LinkAccordion>
    </main>
  )
}
