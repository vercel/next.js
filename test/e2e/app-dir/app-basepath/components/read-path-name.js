import { usePathname } from 'next/navigation'

export function ReadPathName() {
  const pathname = usePathname()
  return (
    <div id="pathname" data-pathname={pathname}>
      {pathname}
    </div>
  )
}
