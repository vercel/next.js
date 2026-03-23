export default async function DynamicPage() {
  const locale = 'messages'
  const data = (await import(`../../data/${locale}.json`)).default
  return (
    <div>
      <p id="dynamic-value">{data.hello}</p>
    </div>
  )
}
