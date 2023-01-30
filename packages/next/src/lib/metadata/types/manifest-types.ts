import z from 'next/dist/compiled/zod'

// TODO: Fill this out
const ManifestSchema = z.object({})

// Types
export type Manifest = z.infer<typeof ManifestSchema>
