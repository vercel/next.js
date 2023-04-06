export default function Page({ params: { params } }) {
  return (
    <div id="page" className={`page_app_${params.join('_')}`}>
      {params.join('/')}
    </div>
  )
}
