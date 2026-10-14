import Counter from './counter'

export default function Page() {
  return (
    <main>
      <p data-mode={process.env.NODE_ENV}>hello world</p>
      <Counter />
    </main>
  )
}
