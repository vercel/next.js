export function generateStaticParams() {
  return [{ __metadata_id__: 'known' }]
}

export function GET() {
  return Response.json({ message: 'Authored metadata-looking route' })
}
