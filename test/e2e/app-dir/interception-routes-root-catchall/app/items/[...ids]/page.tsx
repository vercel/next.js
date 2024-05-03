export default function Page({ params }: { params: { ids: string[] } }) {
  return <div>Regular Item Page. Id: {params.ids}</div>
}
