export default async function Layout(props: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
  modal: React.ReactNode
}) {
  return (
    <html>
      <body>
        <div id="children">{props.children}</div>
        <div>Locale: {(await props.params).locale}</div>
        {props.modal}
      </body>
    </html>
  )
}

export const revalidate = 0
export async function generateStaticParams() {
  return [{ locale: 'en' }]
}
