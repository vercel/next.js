export default function Page({ params }: { params: { ids: string[] } }) {
  return <div>Intercepted Modal Page. Id: {params.ids}</div>
}
