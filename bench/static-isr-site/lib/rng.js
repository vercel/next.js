// Deterministic content helpers. Everything on the site is a pure function
// of a string seed, so two builds always produce the same pages.

const WORDS = (
  'adaptive alloy amber anchor arc atlas aurora balance basalt beacon birch ' +
  'bloom bolt breeze bright brook canvas canyon carbon cedar chroma cinder ' +
  'circuit cloud cobalt comet compact copper coral core crest current delta ' +
  'drift dune echo ember epoch fable fathom fern field flint flux forge ' +
  'frame frost gale garnet glide grain granite grove harbor haven hazel ' +
  'helix horizon indigo iron ivory jade juniper kernel kite lagoon lantern ' +
  'lattice ledger linen lumen maple marble meadow mesa mica mist modular ' +
  'mosaic nectar nimbus north nova oak ocean onyx opal orbit origin osprey ' +
  'paper pebble pine pixel plume polar prairie prism pulse quartz quill ' +
  'radial rapid raven reef ridge river rune sable sage satin scout sequoia ' +
  'shale signal silver slate solar sparrow spruce steel stone summit swift ' +
  'tandem thicket thistle tide timber topaz trail tundra umber valley vapor ' +
  'velvet verdant vertex violet walnut wave willow zenith zephyr'
).split(' ')

export function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// mulberry32
export function rng(seed) {
  let a = hash(String(seed))
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function int(r, min, max) {
  return min + Math.floor(r() * (max - min + 1))
}

export function pick(r, list) {
  return list[Math.floor(r() * list.length)]
}

export function words(r, n) {
  const out = []
  for (let i = 0; i < n; i++) out.push(pick(r, WORDS))
  return out
}

export function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function title(r, n) {
  return words(r, n).map(capitalize).join(' ')
}

export function sentence(r, min = 8, max = 18) {
  const w = words(r, int(r, min, max))
  return capitalize(w.join(' ')) + '.'
}

export function paragraph(r, min = 3, max = 6) {
  const n = int(r, min, max)
  const out = []
  for (let i = 0; i < n; i++) out.push(sentence(r))
  return out.join(' ')
}

export function date(r) {
  const y = 2023 + int(r, 0, 2)
  const m = String(int(r, 1, 12)).padStart(2, '0')
  const d = String(int(r, 1, 28)).padStart(2, '0')
  return `${y}-${m}-${d}`
}
