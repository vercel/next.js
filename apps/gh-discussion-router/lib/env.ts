import { z } from 'zod'

const envSchema = z.object({
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN is required'),
  GITHUB_REPO: z
    .string()
    .min(1, 'GITHUB_REPO is required')
    .regex(/^[\w.-]+\/[\w.-]+$/, 'GITHUB_REPO must be in owner/repo format'),
  SIMILARITY_THRESHOLD: z
    .string()
    .default('0.4')
    .transform((val) => parseFloat(val))
    .pipe(z.number().min(0).max(1)),
  MAX_DISCUSSIONS_TO_FETCH: z
    .string()
    .default('500')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
})

export const env = Object.freeze(
  envSchema.parse({
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GITHUB_REPO: process.env.GITHUB_REPO,
    SIMILARITY_THRESHOLD: process.env.SIMILARITY_THRESHOLD,
    MAX_DISCUSSIONS_TO_FETCH: process.env.MAX_DISCUSSIONS_TO_FETCH,
  })
)
