export default function Step({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <li className="mx-4">
      <input type="checkbox" id={title} className={`mr-2 peer`} />
      <label
        htmlFor={title}
        className={`text-lg text-foreground/90 peer-checked:line-through font-semibold hover:cursor-pointer`}
      >
        {title}
      </label>
      <div
        className={`mx-6 text-foreground/80 text-sm peer-checked:line-through`}
      >
        {children}
      </div>
    </li>
  )
}
