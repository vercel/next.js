export default function Loading() {
  new Promise((resolve) => setTimeout(resolve, 3000))
  return <div>loading</div>
}
