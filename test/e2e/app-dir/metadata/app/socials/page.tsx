export default function page() {
  return 'facebook'
}

export async function generateMetadata() {
  const metadata = {
    facebook: {
      appId: '12345678',
      admins: ['120', '122', '124'],
    },
    pinterest: {
      richPin: true,
    },
  }
  return metadata
}
