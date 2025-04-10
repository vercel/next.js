export default function Home() {
  const translationsContext = (require as any).context(
    './grandparent',
    true,
    /\.txt/
  )
  // In Webpack, logs:
  //     [ './parent/file.txt' ]
  // In Turbopack, logs:
  //     [ './file.txt' ]
  console.log(translationsContext.keys())
  return <pre>{JSON.stringify(translationsContext.keys())}</pre>
}
