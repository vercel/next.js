// This layout is not the root layout, so `team` and `locale` are ordinary
// dynamic params rather than root params. It returns three combinations of
// them, and not the full product of four.
export function generateStaticParams() {
  return [
    { team: 'acme.one-two,three', locale: 'en' },
    { team: 'acme.one-two,three', locale: 'de' },
    { team: 'sparse', locale: 'en' },
  ]
}

export default function TeamLocaleLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
