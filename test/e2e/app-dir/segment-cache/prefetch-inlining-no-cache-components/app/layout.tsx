import { LinkAccordion } from '../components/link-accordion'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>
        <ul>
          <li>
            <LinkAccordion href="/static-page">Static page</LinkAccordion>
          </li>
          <li>
            <LinkAccordion href="/dynamic-page">Dynamic page</LinkAccordion>
          </li>
          <li>
            <LinkAccordion href="/dynamic-edge">Dynamic edge</LinkAccordion>
          </li>
        </ul>
        {children}
      </body>
    </html>
  )
}
