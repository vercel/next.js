// Same as `/raw`, but the rule matching `?raw` is spelled `type: 'raw'`.
const texts = import.meta.glob('./content/*.rst', {
  query: '?raw',
  eager: true,
}) as Record<string, { default: string }>

export default function Page() {
  return (
    <ul>
      {Object.keys(texts).map((key) => (
        <li key={key} id={key}>
          {key}: {texts[key].default.trim()}
        </li>
      ))}
    </ul>
  )
}
