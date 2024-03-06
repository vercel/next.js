interface Triple {
  platform: string
  arch: string
  abi: string | null
  platformArchABI: string
  raw: string
}

export const platformArchTriples: {
  [index: string]: {
    [index: string]: Triple[]
  }
}
