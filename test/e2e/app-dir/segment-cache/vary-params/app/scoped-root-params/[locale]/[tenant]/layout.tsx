import { LinkAccordion } from '../../../../components/link-accordion'

export function generateStaticParams() {
  return [
    { locale: 'es', tenant: 'contoso' },
    { locale: 'en', tenant: 'acme' },
    { locale: 'fr', tenant: 'globex' },
    { locale: 'en', tenant: 'globex' },
  ]
}

export default function RootLayout({
  children,
  sidebar,
}: {
  children: React.ReactNode
  sidebar: React.ReactNode
}) {
  return (
    <html>
      <body>
        {children}
        {sidebar}
        <LinkAccordion href="/scoped-root-params/en/acme" />
        <LinkAccordion href="/scoped-root-params/fr/globex" />
        <LinkAccordion href="/scoped-root-params/en/globex" />
        <LinkAccordion href="/scoped-root-params/en/acme/metadata" />
        <LinkAccordion href="/scoped-root-params/fr/globex/metadata" />
        <LinkAccordion href="/scoped-root-params/en/globex/metadata" />
      </body>
    </html>
  )
}
