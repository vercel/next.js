// Benchmark: getBlurImage() - original format vs webp conversion
//
// Usage: node bench/blur-image-benchmark.js
//
// Compares latency and blurDataURL size when keeping the original image
// format versus converting to webp for the blur placeholder.

const path = require('path')
const fs = require('fs')
const {
  optimizeImage,
} = require('../packages/next/dist/server/image-optimizer')

const BLUR_IMG_SIZE = 8
const BLUR_QUALITY = 70

const TEST_IMAGES = [
  // PNG images
  {
    path: 'test/unit/image-optimizer/images/test.png',
    ext: 'png',
    width: 400,
    height: 400,
  },
  {
    path: 'test/integration/image-optimizer/app/public/grayscale.png',
    ext: 'png',
    width: 36,
    height: 36,
  },
  // JPEG images
  {
    path: 'test/unit/image-optimizer/images/test.jpg',
    ext: 'jpeg',
    width: 400,
    height: 400,
  },
  {
    path: 'test/integration/image-optimizer/app/public/mountains.jpg',
    ext: 'jpeg',
    width: 2800,
    height: 1900,
  },
  // WebP image (baseline - already webp)
  {
    path: 'test/unit/image-optimizer/app/public/test.webp',
    ext: 'webp',
    width: 400,
    height: 400,
  },
  // Wide PNG images
  {
    path: 'test/integration/next-image-new/app-dir/public/wide.png',
    ext: 'png',
    width: 1200,
    height: 700,
  },
  {
    path: 'test/integration/next-image-new/app-dir/public/super-wide.png',
    ext: 'png',
    width: 1920,
    height: 25,
  },
  // Photo JPEG images
  {
    path: 'examples/image-component/public/cat.jpg',
    ext: 'jpeg',
    width: 1500,
    height: 2000,
  },
  {
    path: 'examples/image-component/public/dog.jpg',
    ext: 'jpeg',
    width: 1500,
    height: 2000,
  },
  // Logo PNG
  {
    path: 'examples/image-component/public/vercel.png',
    ext: 'png',
    width: 1600,
    height: 1600,
  },
  // AVIF images
  {
    path: 'test/unit/image-optimizer/images/test.avif',
    ext: 'avif',
    width: 400,
    height: 400,
  },
]

function computeBlurDimensions(width, height) {
  let blurWidth, blurHeight
  if (width >= height) {
    blurWidth = BLUR_IMG_SIZE
    blurHeight = Math.max(Math.round((height / width) * BLUR_IMG_SIZE), 1)
  } else {
    blurWidth = Math.max(Math.round((width / height) * BLUR_IMG_SIZE), 1)
    blurHeight = BLUR_IMG_SIZE
  }
  return { blurWidth, blurHeight }
}

async function runBlur(buffer, ext, blurWidth, blurHeight) {
  const optimized = await optimizeImage({
    buffer,
    width: blurWidth,
    height: blurHeight,
    contentType: `image/${ext}`,
    quality: BLUR_QUALITY,
  })
  const dataURL = `data:image/${ext};base64,${optimized.toString('base64')}`
  return { optimized, dataURL }
}

async function benchmark(label, fn, iterations = 50) {
  // Warmup
  for (let i = 0; i < 3; i++) {
    await fn()
  }

  const times = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await fn()
    times.push(performance.now() - start)
  }

  times.sort((a, b) => a - b)
  return {
    label,
    median: times[Math.floor(times.length / 2)],
    mean: times.reduce((a, b) => a + b, 0) / times.length,
    p95: times[Math.floor(times.length * 0.95)],
    min: times[0],
    max: times[times.length - 1],
  }
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..')
  const iterations = 50

  console.log(`Blur Image Benchmark (${iterations} iterations each)`)
  console.log('='.repeat(100))
  console.log()

  const results = []

  for (const img of TEST_IMAGES) {
    const fullPath = path.join(repoRoot, img.path)
    if (!fs.existsSync(fullPath)) {
      console.log(`SKIP: ${img.path} (not found)`)
      continue
    }

    const content = fs.readFileSync(fullPath)
    const fileSize = content.length
    const { blurWidth, blurHeight } = computeBlurDimensions(
      img.width,
      img.height
    )
    const basename = path.basename(img.path)

    console.log(
      `${basename} (${img.ext}, ${fileSize} bytes, ${img.width}x${img.height} → ${blurWidth}x${blurHeight})`
    )
    console.log('-'.repeat(100))

    // Original format
    const origResult = await runBlur(content, img.ext, blurWidth, blurHeight)
    const origTiming = await benchmark(
      `  ${img.ext} (original)`,
      () => runBlur(content, img.ext, blurWidth, blurHeight),
      iterations
    )

    // WebP format
    const webpResult = await runBlur(content, 'webp', blurWidth, blurHeight)
    const webpTiming = await benchmark(
      `  webp (converted)`,
      () => runBlur(content, 'webp', blurWidth, blurHeight),
      iterations
    )

    const origDataURLLen = origResult.dataURL.length
    const webpDataURLLen = webpResult.dataURL.length
    const sizeDiff = (
      ((webpDataURLLen - origDataURLLen) / origDataURLLen) *
      100
    ).toFixed(1)
    const speedDiff = (
      ((webpTiming.median - origTiming.median) / origTiming.median) *
      100
    ).toFixed(1)

    console.log(
      `  ${'Format'.padEnd(18)} ${'Median (ms)'.padStart(12)} ${'Mean (ms)'.padStart(12)} ${'P95 (ms)'.padStart(12)} ${'DataURL len'.padStart(12)} ${'Buf size'.padStart(10)}`
    )
    console.log(
      `  ${(img.ext + ' (original)').padEnd(18)} ${origTiming.median.toFixed(2).padStart(12)} ${origTiming.mean.toFixed(2).padStart(12)} ${origTiming.p95.toFixed(2).padStart(12)} ${String(origDataURLLen).padStart(12)} ${String(origResult.optimized.length).padStart(10)}`
    )
    console.log(
      `  ${'webp (converted)'.padEnd(18)} ${webpTiming.median.toFixed(2).padStart(12)} ${webpTiming.mean.toFixed(2).padStart(12)} ${webpTiming.p95.toFixed(2).padStart(12)} ${String(webpDataURLLen).padStart(12)} ${String(webpResult.optimized.length).padStart(10)}`
    )
    console.log(
      `  Δ webp vs orig:   speed ${speedDiff}%  |  dataURL size ${sizeDiff}%`
    )
    console.log()

    results.push({
      file: basename,
      ext: img.ext,
      fileSize,
      origMedianMs: origTiming.median,
      webpMedianMs: webpTiming.median,
      origDataURLLen,
      webpDataURLLen,
      origBufSize: origResult.optimized.length,
      webpBufSize: webpResult.optimized.length,
    })
  }

  // Summary table
  console.log()
  console.log('SUMMARY')
  console.log('='.repeat(100))
  console.log(
    `${'File'.padEnd(25)} ${'Ext'.padEnd(6)} ${'Orig ms'.padStart(9)} ${'WebP ms'.padStart(9)} ${'Δ Speed'.padStart(9)} ${'Orig URL'.padStart(10)} ${'WebP URL'.padStart(10)} ${'Δ Size'.padStart(9)}`
  )
  console.log('-'.repeat(100))

  for (const r of results) {
    const speedDiff = (
      ((r.webpMedianMs - r.origMedianMs) / r.origMedianMs) *
      100
    ).toFixed(1)
    const sizeDiff = (
      ((r.webpDataURLLen - r.origDataURLLen) / r.origDataURLLen) *
      100
    ).toFixed(1)

    console.log(
      `${r.file.padEnd(25)} ${r.ext.padEnd(6)} ${r.origMedianMs.toFixed(2).padStart(9)} ${r.webpMedianMs.toFixed(2).padStart(9)} ${(speedDiff + '%').padStart(9)} ${String(r.origDataURLLen).padStart(10)} ${String(r.webpDataURLLen).padStart(10)} ${(sizeDiff + '%').padStart(9)}`
    )
  }
  console.log()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
