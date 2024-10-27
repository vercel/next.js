export default function Page() {
  return (
    <div>
      Hello World{' '}
      {typeof window !== 'undefined' && <span>Hydration Error!</span>}
    </div>
  )
}
