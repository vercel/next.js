import { ImageConfigProvider } from 'next/future/image'

export default function ImageConfig({ children }) {
  return (
    <ImageConfigProvider
      value={{
        loader: ({ src, width }) => {
          return `${src}?width=${width}`
        },
      }}
    >
      {children}
    </ImageConfigProvider>
  )
}
