export default function Root({ children }) {
  return (
    <html>
      <head>
        <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
        <title>Hello World</title>
        <script
          dangerouslySetInnerHTML={{
            __html: `if (location.search.includes('bot')) {
              Object.defineProperty(navigator, 'userAgent', {
                value: new URLSearchParams(location.search).get("useragent"),
              });
            }`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
