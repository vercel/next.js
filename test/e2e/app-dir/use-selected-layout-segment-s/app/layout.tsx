import RenderValues from './render-values'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head />
      <body>
        <RenderValues prefix="root" />
        {children}
      </body>
    </html>
  )
}
