# Image optimizer benchmark: native sharp vs WebAssembly sharp

`next/image-optimizer-transform` (the resize and re-encode step behind
`/_next/image`) does its CPU-heavy work in [sharp](https://sharp.pixelplumbing.com/).
sharp ships two kinds of binding and picks one when it is first loaded:

- the prebuilt native binding for the platform, `@img/sharp-<platform>`
  (`@img/sharp-linux-x64` here), when that package can be resolved;
- otherwise the WebAssembly binding, `@img/sharp-wasm32`.

There is no runtime switch. Which binding an app gets is an install-time
decision: `npm install sharp` installs the native binding, and
`npm install --cpu=wasm32 sharp` (the fallback Next.js suggests when sharp
cannot be loaded) skips the native optional dependency so sharp falls back to
the WebAssembly build.

This benchmark answers two questions about that fallback:

1. Does the image optimizer behave the same on the WebAssembly binding?
2. What does it cost?

It installs both variants of the exact sharp version the repository resolves
into isolated directories (`.installs/`, via npm) and runs the real
`optimizeImage()` pipeline against each from a child process
([`worker.cjs`](./worker.cjs)) whose `require('sharp')` is redirected to the
chosen install. Each (source image, output format, width) combination is timed,
and the two outputs are compared byte-for-byte and, when the bytes differ,
pixel-for-pixel after decoding.

## Running it

```bash
pnpm --filter=next build   # the benchmark runs packages/next/dist
pnpm bench:image-optimizer-sharp
```

The default source set is created on first run in `.images/`: a synthetic
12 megapixel "photo" as a 4.3 MB JPEG and an 18 MB PNG, plus the 3.3 MB
2880×2048 PNG screenshot that already lives in the repository
(`packages/next/src/next-devtools/dev-overlay/app.png`). Real photos are better
input for the lossy encoders; pass a directory of them with `--images=<dir>`.

Useful options (`--help` lists them all):

```bash
# add real photos, more iterations
pnpm bench:image-optimizer-sharp --images=~/photos --iterations=10

# only the formats / widths you care about
pnpm bench:image-optimizer-sharp --outputs=image/avif,image/webp --widths=1080

# measure libvips threading (see "sharp.concurrency" below)
pnpm bench:image-optimizer-sharp --concurrency=4

# a different sharp release
pnpm bench:image-optimizer-sharp --sharp-version=0.35.5
```

Every run writes `results.md` and `results.json` (with all samples and the
outputs' hashes) to `artifacts/<timestamp>/`. The `optimizeImage()` options
default to what `next start` uses (`quality` 75, `imgOptTimeoutInSeconds` 7,
`imgOptMaxInputPixels` 268402689, `mozjpeg` on) except for the libvips
operation cache, which is off so that repeating the same input cannot
short-circuit the work; each iteration also gets a fresh copy of the input
buffer.

Two things make it easy to benchmark the wrong binding by accident, and both
are guarded against:

- sharp loads the native binding whenever `require()` can reach it. pnpm's
  `.bin` shims (so `pnpm bench:...`) export a `NODE_PATH` that includes the
  repository's hoisted `node_modules/.pnpm/node_modules`, where
  `@img/sharp-linux-x64` lives, which is enough for a wasm-only install to load
  the native binding. Child processes therefore get a clean `NODE_PATH`.
- The worker refuses to run if the binding it loaded does not match the
  variant it was asked to benchmark (`@img/sharp-wasm32` reports an
  `emscripten` version; the native binding does not).

## The test suites on the WebAssembly binding

The same swap is covered by tests, so functional parity is checked in CI and
not only by this benchmark:

- `test/unit/image-optimizer/transform-sharp-wasm.test.ts` runs the
  `imageOptimizerTransform` unit tests with the native binding made
  unresolvable, so sharp falls back to `@img/sharp-wasm32` (a devDependency of
  the repository, pinned to the sharp version `packages/next` resolves).
- `test/e2e/image-optimizer/sharp-wasm.test.ts` runs the full `/_next/image`
  e2e suite of `sharp.test.ts` against an app whose isolated install removes
  the native binding packages with pnpm overrides and adds
  `@img/sharp-wasm32`, i.e. the install `npm install --cpu=wasm32 sharp`
  produces. Each suite first asserts which binding the install loads.

## Results (2026-10-11)

Full reports, including every combination, are in [`results/`](./results):

- [`2026-10-11-linux-x64-concurrency-1.md`](./results/2026-10-11-linux-x64-concurrency-1.md):
  Next.js defaults (one libvips thread, see below)
- [`2026-10-11-linux-x64-concurrency-4.md`](./results/2026-10-11-linux-x64-concurrency-4.md):
  `--concurrency=4`
- [`2026-10-11-linux-x64-edge-case-parity.md`](./results/2026-10-11-linux-x64-edge-case-parity.md):
  output comparison for EXIF-rotated, alpha, 16-bit, CMYK, ICC-tagged,
  grayscale, progressive JPEG, lossless WebP, AVIF, GIF and TIFF sources
  (one iteration, parity only)

### Environment and methodology

- Node.js v22.22.2, linux-x64 (glibc), Intel Xeon @ 2.90GHz × 4 vCPUs, 8 GiB
  RAM (a Vercel sandbox; absolute numbers will differ elsewhere, the ratios are
  the point)
- sharp 0.35.4; native `@img/sharp-linux-x64` with libvips 8.18.6, libaom
  3.15.0, libheif 1.23.2, libwebp 1.6.0, mozjpeg, libpng 1.6.58; WebAssembly
  `@img/sharp-wasm32` with the same libvips, libheif, libwebp, mozjpeg and
  libpng but **libaom 3.14.1** and emscripten 6.0.8
- 5 timed iterations after 1 warmup per combination, variants in separate
  processes run one after the other on an otherwise idle machine, median
  reported
- Sources: the generated 4000×3000 synthetic photo as JPEG (4.3 MB) and PNG
  (18.3 MB), the repository's 2880×2048 UI screenshot PNG (3.3 MB), and a real
  photograph: NASA's 3000×3002 "Blue Marble" (Apollo 17, public domain, from
  Wikimedia Commons) as the original 6.2 MB JPEG and a lossless 19.1 MB PNG
  conversion
- Outputs: WebP, AVIF, JPEG and PNG at widths 1920 and 640, `q=75`, i.e.
  JPEG→WebP, JPEG→AVIF, PNG→WebP, PNG→AVIF and the same-format and JPEG/PNG
  cross conversions; 40 combinations per run

### Functional parity

- The unit suite (16 tests) and the e2e suite (`sharp-wasm.test.ts`, 180 tests
  in `next dev` with Turbopack and 180 in `next build` + `next start` with
  webpack) pass on the WebAssembly binding, with the same results as on the
  native binding.
- Output comparison over the 40 benchmark combinations (one thread): 38 are
  byte-identical, including every AVIF, WebP and JPEG. The two that differ are
  palette-quantised PNGs at width 640 (`png({ quality })` enables
  libimagequant, a lossy quantiser whose floating point rounding differs
  between the builds): at most 5/255 on 30 and 129 of 1.2 million samples,
  PSNR 83 and 77 dB.
- Over the 48 edge-case combinations: 41 byte-identical, the other 7 again
  palette PNGs, each with 3 to 41 of 1.1 million samples differing (PSNR 64–87
  dB). EXIF auto-rotation, alpha, 16-bit, CMYK, ICC profiles, grayscale,
  progressive JPEG, lossless WebP, AVIF, GIF and TIFF inputs all decode and
  convert identically.
- Inputs at the default `imgOptMaxInputPixels` ceiling (a 16000×16000 PNG,
  256 megapixels) resize fine on both bindings; the WebAssembly build used
  about 120 MB more RSS (324 MB vs 206 MB) and 1.9× the time.
- Blocked loaders (`sharp.block`/`unblock`), the per-image `timeout`,
  `limitInputPixels` and `sequentialRead` behave the same. One nuance that is
  identical in both builds: the libvips timeout only fires between evaluation
  steps, so it does not interrupt an AVIF encode in progress (a 1 s timeout
  neither stopped a 2.3 s native nor a 9 s WebAssembly AVIF encode, while it
  did stop a WebAssembly WebP encode that takes 1.2 s).

### Performance, one libvips thread (Next.js defaults on this host)

Geometric mean of the per-combination ratio of medians, WebAssembly over
native:

| Output     | combinations | wasm / native | range       |
| ---------- | ------------ | ------------- | ----------- |
| WebP       | 10           | 1.51×         | 1.18–1.97×  |
| AVIF       | 10           | 3.42×         | 2.56–4.54×  |
| JPEG       | 10           | 1.63×         | 1.29–1.92×  |
| PNG        | 10           | 1.25×         | 1.10–1.39×  |
| **all 40** |              | **1.80×**     |             |

Selected medians (native → WebAssembly):

| Combination                              | native  | wasm    | ratio |
| ---------------------------------------- | ------- | ------- | ----- |
| Blue Marble JPEG (6.2 MB) → WebP @ 1920  | 691 ms  | 1.18 s  | 1.71× |
| Blue Marble JPEG (6.2 MB) → AVIF @ 1920  | 2.19 s  | 8.36 s  | 3.81× |
| Blue Marble JPEG (6.2 MB) → WebP @ 640   | 187 ms  | 322 ms  | 1.72× |
| Blue Marble JPEG (6.2 MB) → AVIF @ 640   | 431 ms  | 1.21 s  | 2.81× |
| Blue Marble PNG (19.1 MB) → WebP @ 1920  | 512 ms  | 721 ms  | 1.41× |
| Blue Marble PNG (19.1 MB) → AVIF @ 1920  | 2.04 s  | 7.76 s  | 3.81× |
| synthetic photo JPEG (4.3 MB) → WebP @ 1920 | 485 ms | 571 ms | 1.18× |
| synthetic photo JPEG (4.3 MB) → AVIF @ 1920 | 1.00 s | 4.46 s | 4.44× |
| synthetic photo PNG (18.3 MB) → WebP @ 1920 | 418 ms | 656 ms | 1.57× |
| synthetic photo PNG (18.3 MB) → AVIF @ 1920 | 1.00 s | 4.54 s | 4.54× |
| screenshot PNG (3.3 MB) → WebP @ 1920    | 340 ms  | 572 ms  | 1.68× |
| screenshot PNG (3.3 MB) → AVIF @ 1920    | 1.24 s  | 4.79 s  | 3.88× |

Startup: `require('sharp')` plus the one-time configuration took 41 ms native
and 120 ms WebAssembly (compiling and instantiating the 9 MB module). Peak RSS
of the worker over the whole run was 675 MB native and 693 MB WebAssembly.

### Performance, four libvips threads

With `sharp.concurrency(4)` the native AVIF encoder (libaom) uses the threads
and gets 2.6× faster (CPU time / wall time 2.65), while the WebAssembly build's
AVIF encode stays single-threaded (CPU / wall 1.02, same wall time as with one
thread). The WebP, JPEG and PNG encoders are single-threaded in both builds, so
only AVIF moves:

| Output     | native median, Blue Marble JPEG @ 1920 | wasm   | wasm / native (geomean over 10) |
| ---------- | -------------------------------------- | ------ | ------------------------------- |
| WebP       | 669 ms                                 | 1.17 s | 1.48×                           |
| AVIF       | 832 ms                                 | 8.16 s | 7.38× (3.9–12.3×)               |
| JPEG       | 601 ms                                 | 1.17 s | 1.69×                           |
| PNG        | 2.43 s                                 | 2.81 s | 1.21×                           |

libaom's bitstream also depends on the thread count, in both builds: every
AVIF output changed between the one-thread and four-thread runs, and at four
threads the two builds only match byte-for-byte in 2 of the 10 AVIF
combinations (the other 8 differ by at most 8/255, PSNR 56–71 dB). With one
thread, all 10 are identical.

Note on `sharp.concurrency`: on glibc-based Linux sharp defaults to a single
thread for both bindings, and `getSharp()` only applies
`experimental.imgOptConcurrency` when the default is above 1, so on a typical
Linux server the image optimizer runs libvips single-threaded whatever the
config says. The benchmark sets the concurrency explicitly when
`--concurrency` is passed so that threading can still be measured.

### Takeaways

- The WebAssembly build of sharp is a functional drop-in for the image
  optimizer: the same loaders and options, and with the default single libvips
  thread every AVIF, WebP and JPEG output was byte-identical.
- It costs roughly 1.1–2× CPU for WebP, JPEG and PNG and 3–4.5× for AVIF per
  request, plus ~80 ms more cold start; and because the WebAssembly libaom
  cannot use threads, the gap for AVIF grows to 4–12× on hosts where the native
  build is allowed more than one libvips thread. The largest AVIF encodes
  measured here (6 MB photo to 1920 px) take 8 s on WebAssembly, which is past
  the 7 s `imgOptTimeoutInSeconds` default even though the timeout cannot
  interrupt them.
- The WebAssembly package bundles its own libaom (3.14.1 here vs 3.15.0 in the
  native build), so AVIF output can diverge between the two when the native
  libvips package is updated independently.
