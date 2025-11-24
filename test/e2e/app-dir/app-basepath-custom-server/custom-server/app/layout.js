import { Counter } from '../components/counter'
export default function Root({ children }) {
  return (
    <html>
      <body>
        <Counter />
        {children}
      </body>
    </html>
  )
}
