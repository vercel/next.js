export default function Page() {
  return (
    <div id="process">
      Hello, {process.env.NEXT_PUBLIC_VISITOR ?? 'stranger'}
    </div>
  )
}
