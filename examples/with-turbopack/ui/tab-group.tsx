import { Tab } from '#/ui/tab'

export type Item = {
  text: string
  slug?: string
  segment?: string
}

export const TabGroup = ({ path, items }: { path: string; items: Item[] }) => {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item) => (
        <Tab key={path + item.slug} item={item} path={path} />
      ))}
    </div>
  )
}
