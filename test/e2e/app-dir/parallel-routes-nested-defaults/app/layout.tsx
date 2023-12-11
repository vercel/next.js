export default function Layout({
  children,
  sidebar,
}: {
  children: React.ReactNode
  sidebar: React.ReactNode
}) {
  return (
    <html>
      <head>
        <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
      </head>
      <body>
        <div
          className="border border-black absolute w-56 overflow-auto h-[2000px]"
          id="sidebar"
        >
          {sidebar}
        </div>
        <div
          className="h-full border borer-black absolute left-56 w-full"
          id="content"
        >
          {children}
        </div>
      </body>
    </html>
  )
}
