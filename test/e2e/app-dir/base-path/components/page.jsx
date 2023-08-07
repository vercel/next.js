import { usePathname } from 'next/navigation'

export function Page() {
  const pathname = usePathname()
  return (
    <div id="pathname" data-pathname={pathname}>
      {pathname}
    </div>
  )
}
