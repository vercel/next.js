import Client from '../client'

// eslint-disable-next-line no-template-curly-in-string -- adversarial escape content
const longText = '</script><script>alert(1)</script> ✓🙃 `${x}` "y" '.repeat(80)

export default function Page() {
  return (
    <main>
      <h1>long text</h1>
      <Client label={longText} />
    </main>
  )
}
