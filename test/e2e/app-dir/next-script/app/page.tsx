import Script from 'next/script'

export default function Page() {
  return (
    <Script
      src="https://code.jquery.com/jquery-3.7.1.min.js"
      crossOrigin="use-credentials"
    />
  )
}
