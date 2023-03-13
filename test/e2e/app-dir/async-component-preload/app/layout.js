export const revalidate = 0

export default async function RootLayout({ children }) {
  await new Promise((resolve) => setTimeout(resolve, 0))

  return (
    <html lang="en">
      <head />
      <body>{children}</body>
    </html>
  )
}
