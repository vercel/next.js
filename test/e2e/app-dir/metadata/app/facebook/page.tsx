export default function page() {
  return 'facebook'
}

export async function generateMetadata() {
  const metadata = {
    facebook: {
      appId: '12345678',
    },
  }
  return metadata
}
