import { LinkAccordion } from '../../../components/link-accordion'

// Home page for a (lang, region) pair, e.g. /en/us. It renders accordion links
// to the same posts route under several (lang, region) combinations so the test
// can prime and probe the shell cache without navigating.
export default function Page() {
  return (
    <main>
      <h1>Home</h1>
      <ul>
        <li>
          <LinkAccordion href="/en/uk/posts/1">en/uk post 1</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/en/gb/posts/1">en/gb post 1</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/fr/uk/posts/1">fr/uk post 1</LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
