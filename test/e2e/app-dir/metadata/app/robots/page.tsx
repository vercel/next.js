export default function page() {
  return 'robots'
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
