import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderHeading
} from "@/components/page-header"

export const dynamic = "force-dynamic"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <div className="container relative">
        <PageHeader>
          <PageHeaderHeading className="hidden md:block">
            Objective Next.js 14 Quickstart
          </PageHeaderHeading>
          <PageHeaderHeading className="md:hidden">Objective Quickstart</PageHeaderHeading>
          <PageHeaderDescription>
            A simple search UI for your Objective powered Next.js app
          </PageHeaderDescription>
        </PageHeader>
        <section className="pb-20">
          {children}
        </section>
      </div>
    </>
  )
}
