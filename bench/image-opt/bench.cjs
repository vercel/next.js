const { join } = require('path');
const { readFile } = require('fs/promises');

const images = [
  '../../examples/image-component/public/cat.jpg',
  '../../examples/image-component/public/dog.jpg',
  '../../examples/image-component/public/mountains.jpg',
  '../../examples/image-component/public/vercel.png',
  '../../examples/with-expo-typescript/public/demo.png',
  '../../examples/with-sfcc/public/hero.jpg',
  '../../test/integration/image-optimizer/app/public/test.jpg',
  '../../test/integration/image-optimizer/app/public/test.png',
  '../../test/integration/image-optimizer/app/public/test.webp',
  '../../test/integration/image-optimizer/app/public/test.avif',
].map(f => join(__dirname, f))

const pad = (ms) => {
  const [left, _right] = ms.toFixed(3).split('.')
  // less than 1 ms is not useful, so ignore for now
  return `${left.padStart(4, '0')}ms`
}

async function bench(func, width, quality) {
  console.log(`\nBenchmark f=${func.name}, w=${width}, q=${quality}`)
  for (const pkg of ['sharp-native', 'sharp-wasm', 'squoosh']) {
    let sum = 0
    let max = Number.NEGATIVE_INFINITY
    let min = Number.POSITIVE_INFINITY
    for (const image of images) {
      const buffer = await readFile(image)
      const start = performance.now()
      const result = await func(pkg, buffer, width, quality)
      if (result.length === 0) {
        throw new Error('result was length 0')
      }
      const end = performance.now()
      const time = (end - start)
      sum += time
      max = Math.max(max, time)
      min = Math.min(min, time)
    }
    
    const avg = sum / images.length
    const p90 = (sum - max) / (images.length - 1)
    console.log(`      ${pkg.padStart(12)}: avg ${pad(avg)}, p90 ${pad(p90)}, max ${pad(max)}, min ${pad(min)}`)
  }
}

async function webp(pkg, buffer, width, quality) {
  if (pkg.startsWith('sharp')) {
    const sharp = require(`/Users/styfle/Code/foo/${pkg}/node_modules/sharp`);
    const optimized = await sharp(buffer).resize(width, undefined, {
      withoutEnlargement: true,
    }).webp({ quality }).toBuffer()
    return optimized;
  } else if (pkg === 'squoosh') {
    const { processBuffer } = require('next/dist/server/lib/squoosh/main')
    const operations = [];
    operations.push({ type: 'resize', width })
    const optimized = await processBuffer(buffer, operations, 'webp', quality)
    return optimized;
  } else {
    throw new Error(`Unknown package ${pkg}`)
  }
}

async function avif(pkg, buffer, width, quality) {
  if (pkg.startsWith('sharp')) {
    const sharp = require(`/Users/styfle/Code/foo/${pkg}/node_modules/sharp`);
    const transformer = sharp(buffer)
    transformer.resize(width, undefined, {
      withoutEnlargement: true,
    })
    const avifQuality = quality - 15
    transformer.avif({
      quality: Math.max(avifQuality, 0),
      chromaSubsampling: '4:2:0', // same as webp
    })
    const result = await transformer.toBuffer()
    return result
  } else if (pkg === 'squoosh') {
    const { processBuffer } = require('next/dist/server/lib/squoosh/main')
    const operations = [];
    operations.push({ type: 'resize', width })
    const result = await processBuffer(buffer, operations, 'avif', quality)
    return result
  } else {
    throw new Error(`Unknown package ${pkg}`)
  }
}

async function main() {
  console.log(`Running benchmarks on ${process.platform} (${process.arch}) with ${images.length} images...`)
  await bench(webp, 2048, 75)
  await bench(webp, 1080, 75)
  await bench(webp, 256, 50)

  await bench(avif, 2048, 75)
  await bench(avif, 1080, 75)
  await bench(avif, 256, 50)
  
  console.log(`Benchmark complete.`)
  process.exit(0)
}

main().then(console.log).catch(console.error)