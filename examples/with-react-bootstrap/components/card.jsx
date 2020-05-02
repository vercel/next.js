/**
 * simple card component
 *
 * @2020/05/01
 */
export default function Card({ href, title, text }) {
  return (
    <a href={href} className="card">
      <h3>{title} &rarr;</h3>
      <p>{text}</p>
    </a>
  )
}
