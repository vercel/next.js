/**
 * My JSDoc comment that should be minified away
 *
 * @author Example One <example1@example.com>
 * @author Example Two <example2@example.com>
 * @copyright 2024 Vercel Inc
 */
class TestClass {
  static text = 'hello world'
}

export default function Page() {
  return (
    <div>
      <p>{TestClass.text}</p>
    </div>
  )
}
