export const metadata = {
  title: 'Layout (Not supposed to be seen)',
  description: 'Layout Description (Not supposed to be seen)',
}

export async function generateStaticParams() {
  return [
    {
      params: {
        lang: 'en',
      },
    },
    {
      params: {
        lang: 'fr',
      },
    },
  ]
}

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
