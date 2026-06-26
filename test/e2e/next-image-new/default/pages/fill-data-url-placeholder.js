import Image from 'next/image'

// We don't use a static import intentionally
const shimmer = `data:image/svg+xml;base64,Cjxzdmcgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImciPgogICAgICA8c3RvcCBzdG9wLWNvbG9yPSIjMzMzIiBvZmZzZXQ9IjIwJSIgLz4KICAgICAgPHN0b3Agc3RvcC1jb2xvcj0iIzIyMiIgb2Zmc2V0PSI1MCUiIC8+CiAgICAgIDxzdG9wIHN0b3AtY29sb3I9IiMzMzMiIG9mZnNldD0iNzAlIiAvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiMzMzMiIC8+CiAgPHJlY3QgaWQ9InIiIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSJ1cmwoI2cpIiAvPgogIDxhbmltYXRlIHhsaW5rOmhyZWY9IiNyIiBhdHRyaWJ1dGVOYW1lPSJ4IiBmcm9tPSItMjAwIiB0bz0iMjAwIiBkdXI9IjFzIiByZXBlYXRDb3VudD0iaW5kZWZpbml0ZSIgIC8+Cjwvc3ZnPg==`

export default function Page() {
  return (
    <>
      <p>Image with fill with Data URL placeholder</p>
      <div style={{ position: 'relative', display: 'flex', minHeight: '30vh' }}>
        <Image
          fill
          alt="alt"
          src="/wide.png"
          placeholder={shimmer}
          id="data-url-placeholder-fit-cover"
          style={{ objectFit: 'cover' }}
        />
      </div>

      <div style={{ position: 'relative', display: 'flex', minHeight: '30vh' }}>
        <Image
          fill
          alt="alt"
          src="/wide.png"
          placeholder={shimmer}
          id="data-url-placeholder-fit-contain"
          style={{ objectFit: 'contain' }}
        />
      </div>

      <div style={{ position: 'relative', display: 'flex', minHeight: '30vh' }}>
        <Image
          fill
          alt="alt"
          src="/wide.png"
          placeholder={shimmer}
          id="data-url-placeholder-fit-fill"
          style={{ objectFit: 'fill' }}
        />
      </div>
    </>
  )
}
