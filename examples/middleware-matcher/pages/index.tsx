export default function Home() {
  const matching = ['/about', '/about/topic/cats', '/public/disclaimer']
  const notMatching = ['/public', '/public/disclaimer/nested', '/static']
  return (
    <div>
      <h1>Middleware matching</h1>
      <p>The current middleware configuration is:</p>
      <pre>
        export const config = {'{'}
        <br />
        {'  '}matcher: [ <br />
        {'    '}'/public/disclaimer', // match a single, specific page
        <br />
        {'    '}'/((?!public|static).*) // match all pages not starting with
        'public' or 'static' <br />
        {'   '}] <br />
        {'}'}
      </pre>
      <ul>
        {[...notMatching, ...matching].map((href) => (
          <li key={href}>
            <a href={href}>{href}</a>
          </li>
        ))}
      </ul>
    </div>
  )
}
