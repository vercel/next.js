import { usePathname } from 'next/navigation'

export function ReadPathname() {
  const pathname = usePathname()
  return (
    <div id="pathname" data-pathname={pathname}>
      {pathname}
    </div>
  )
}
