// TODO(alexkirsz) export * would be preferrable here once supported.
export {
  default,
  // @ts-expect-error
  getStaticProps,
  // @ts-expect-error
  __N_SSG,
  // @ts-expect-error
  __N_SSP,
} from '@vercel/turbopack-next/internal/_error'
