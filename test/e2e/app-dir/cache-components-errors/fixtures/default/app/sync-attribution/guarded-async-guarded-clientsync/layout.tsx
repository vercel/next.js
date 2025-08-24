export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <main>{children}</main>
        <div>
          We add extra content here because it increases the size of the dev RSC
          payload which exercises the preloading of the RSC chunks more. We want
          a greater page weight than this simple test would otherwise have
          produced.
        </div>
      </body>
    </html>
  )
}
