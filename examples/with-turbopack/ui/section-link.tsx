import Link from 'next/link'

export const SectionLink = ({
  children,
  href,
  text,
}: {
  children: React.ReactNode
  href: string
  text: string
}) => (
  <Link href={href} className="group block space-y-2">
    <div className="-m-[5px] rounded-[20px] border border-gray-900 p-1 transition group-hover:border-blue-600">
      {children}
    </div>
    <div className="font-medium text-white">{text}</div>
  </Link>
)
