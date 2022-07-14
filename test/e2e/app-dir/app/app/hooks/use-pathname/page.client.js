import { usePathname } from 'next/dist/client/components/hooks-client'

export default function Page() {
  const pathname = usePathname()

  return (
    <>
      <h1 id="pathname" data-pathname={pathname}>
        hello from /hooks/use-pathname
      </h1>
    </>
  )
}
