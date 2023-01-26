export default function page() {
  return <p>robots</p>
}

export const metadata = {
  robots: {
    index: false,
    follow: true,
    nocache: true,

    googleBot: {
      index: true,
      follow: false,
      noimageindex: true,
    },
  },
}
