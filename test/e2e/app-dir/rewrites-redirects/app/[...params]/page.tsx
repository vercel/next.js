export default function Page({ params: { params } }) {
  return <div id="page">{params.join('/')}</div>
}
