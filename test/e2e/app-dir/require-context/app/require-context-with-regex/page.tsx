export default function Home() {
  const translationsContext = (require as any).context(
    '../grandparent',
    true,
    /\.js/
  )

  return <pre>{JSON.stringify(translationsContext.keys())}</pre>
}
