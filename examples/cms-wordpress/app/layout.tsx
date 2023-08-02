import '../styles/index.css'
// remove the following lines if you do not use metadata in the root layout
// import { Metadata } from 'next';
// export const metadata: Metadata = {
// 	title: '',
// 	description: '',
// };
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
