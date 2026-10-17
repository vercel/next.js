# Image optimizer: native sharp vs WebAssembly sharp

## Environment

- Node.js v22.22.2, linux-x64 (6.18.49)
- CPU: Intel(R) Xeon(R) Processor @ 2.90GHz × 4, 8.2 GiB RAM
- sharp 0.35.4
- native: `@img/sharp-linux-x64` — libvips 8.18.6, aom 3.15.0, libheif 1.23.2, libwebp 1.6.0, mozjpeg 0826579, libpng 1.6.58, highway 1.4.0; sharp.concurrency() = 1
- wasm: `@img/sharp-wasm32` — libvips 8.18.6, aom 3.14.1, libheif 1.23.2, libwebp 1.6.0, mozjpeg 0826579, libpng 1.6.58, highway 1.4.0, emscripten 6.0.8; sharp.concurrency() = 1
- optimizeImage() options: quality 75, concurrency Next.js default, operation cache false, timeout 7s, limitInputPixels 268402689, mozjpeg true
- 1 timed iterations after 0 warmup run(s) per combination; each variant runs in its own process, variants run sequentially

## Sources

| Source                  | Type       | Dimensions | Size     |
| ----------------------- | ---------- | ---------- | -------- |
| 16bit.png               | image/png  | 1200×800   | 2.77 MB  |
| alpha.png               | image/png  | 1200×800   | 1.35 MB  |
| cmyk.jpg                | image/jpeg | 1200×800   | 1.31 MB  |
| exif-orientation-6.jpg  | image/jpeg | 1200×800   | 313.9 KB |
| exif-orientation-8.webp | image/webp | 1200×800   | 174.8 KB |
| grayscale.jpg           | image/jpeg | 1200×800   | 271.9 KB |
| icc-p3.jpg              | image/jpeg | 1200×800   | 287.1 KB |
| lossless.webp           | image/webp | 1200×800   | 1.46 MB  |
| photo.avif              | image/avif | 1200×800   | 111.3 KB |
| photo.tiff              | image/tiff | 1200×800   | 199.4 KB |
| progressive.jpg         | image/jpeg | 1200×800   | 269.8 KB |
| static.gif              | image/gif  | 1200×800   | 890.9 KB |

## Startup

Time to `require('sharp')` and configure it (for wasm32 this includes compiling and instantiating the WebAssembly module), and peak RSS of the worker process over the whole run.

| Variant | Load     | Peak RSS  |
| ------- | -------- | --------- |
| native  | 36.6 ms  | 223.36 MB |
| wasm    | 132.2 ms | 307.36 MB |

## Results

Median wall time of `optimizeImage()` per combination. "wasm / native" is the ratio of medians. Parity compares the two outputs: byte-identical, or decoded-pixel-identical, or the pixel difference.

| Source → output @ width              | native median (min–p95)      | wasm median (min–p95)        | wasm / native | native bytes | wasm bytes | parity                                                                  |
| ------------------------------------ | ---------------------------- | ---------------------------- | ------------- | ------------ | ---------- | ----------------------------------------------------------------------- |
| 16bit.png → webp @ 640               | 99.5 ms (99.5 ms–99.5 ms)    | 291.1 ms (291.1 ms–291.1 ms) | 2.93×         | 51.9 KB      | 51.9 KB    | identical bytes                                                         |
| 16bit.png → avif @ 640               | 318.5 ms (318.5 ms–318.5 ms) | 1.16 s (1.16 s–1.16 s)       | 3.63×         | 25.5 KB      | 25.5 KB    | identical bytes                                                         |
| 16bit.png → jpg @ 640                | 100.6 ms (100.6 ms–100.6 ms) | 140.1 ms (140.1 ms–140.1 ms) | 1.39×         | 48.0 KB      | 48.0 KB    | identical bytes                                                         |
| 16bit.png → png @ 640                | 445.9 ms (445.9 ms–445.9 ms) | 615.0 ms (615.0 ms–615.0 ms) | 1.38×         | 180.4 KB     | 180.4 KB   | pixels differ: max Δ16 on 3 of 1093120 samples (0.00027%), PSNR 83.4 dB |
| alpha.png → webp @ 640               | 53.0 ms (53.0 ms–53.0 ms)    | 99.3 ms (99.3 ms–99.3 ms)    | 1.87×         | 25.7 KB      | 25.7 KB    | identical bytes                                                         |
| alpha.png → avif @ 640               | 202.8 ms (202.8 ms–202.8 ms) | 618.1 ms (618.1 ms–618.1 ms) | 3.05×         | 13.6 KB      | 13.6 KB    | identical bytes                                                         |
| alpha.png → jpg @ 640                | 43.5 ms (43.5 ms–43.5 ms)    | 80.7 ms (80.7 ms–80.7 ms)    | 1.85×         | 17.4 KB      | 17.4 KB    | identical bytes                                                         |
| alpha.png → png @ 640                | 104.9 ms (104.9 ms–104.9 ms) | 136.3 ms (136.3 ms–136.3 ms) | 1.30×         | 59.5 KB      | 59.5 KB    | pixels differ: max Δ48 on 41 of 1093120 samples (0.0038%), PSNR 63.8 dB |
| cmyk.jpg → webp @ 640                | 173.1 ms (173.1 ms–173.1 ms) | 290.8 ms (290.8 ms–290.8 ms) | 1.68×         | 54.3 KB      | 54.3 KB    | identical bytes                                                         |
| cmyk.jpg → avif @ 640                | 401.6 ms (401.6 ms–401.6 ms) | 1.05 s (1.05 s–1.05 s)       | 2.61×         | 26.6 KB      | 26.6 KB    | identical bytes                                                         |
| cmyk.jpg → jpg @ 640                 | 174.0 ms (174.0 ms–174.0 ms) | 293.4 ms (293.4 ms–293.4 ms) | 1.69×         | 49.9 KB      | 49.9 KB    | identical bytes                                                         |
| cmyk.jpg → png @ 640                 | 564.2 ms (564.2 ms–564.2 ms) | 642.8 ms (642.8 ms–642.8 ms) | 1.14×         | 181.7 KB     | 181.7 KB   | identical bytes                                                         |
| exif-orientation-6.jpg → webp @ 640  | 100.7 ms (100.7 ms–100.7 ms) | 192.3 ms (192.3 ms–192.3 ms) | 1.91×         | 98.2 KB      | 98.2 KB    | identical bytes                                                         |
| exif-orientation-6.jpg → avif @ 640  | 489.2 ms (489.2 ms–489.2 ms) | 1.61 s (1.61 s–1.61 s)       | 3.28×         | 48.1 KB      | 48.1 KB    | identical bytes                                                         |
| exif-orientation-6.jpg → jpg @ 640   | 101.1 ms (101.1 ms–101.1 ms) | 188.9 ms (188.9 ms–188.9 ms) | 1.87×         | 94.7 KB      | 94.7 KB    | identical bytes                                                         |
| exif-orientation-6.jpg → png @ 640   | 522.3 ms (522.3 ms–522.3 ms) | 609.5 ms (609.5 ms–609.5 ms) | 1.17×         | 341.0 KB     | 341.0 KB   | identical bytes                                                         |
| exif-orientation-8.webp → webp @ 640 | 98.6 ms (98.6 ms–98.6 ms)    | 164.7 ms (164.7 ms–164.7 ms) | 1.67×         | 81.2 KB      | 81.2 KB    | identical bytes                                                         |
| exif-orientation-8.webp → avif @ 640 | 505.8 ms (505.8 ms–505.8 ms) | 1.50 s (1.50 s–1.50 s)       | 2.96×         | 42.8 KB      | 42.8 KB    | identical bytes                                                         |
| exif-orientation-8.webp → jpg @ 640  | 113.7 ms (113.7 ms–113.7 ms) | 170.4 ms (170.4 ms–170.4 ms) | 1.50×         | 85.1 KB      | 85.1 KB    | identical bytes                                                         |
| exif-orientation-8.webp → png @ 640  | 287.8 ms (287.8 ms–287.8 ms) | 323.8 ms (323.8 ms–323.8 ms) | 1.13×         | 311.6 KB     | 311.6 KB   | identical bytes                                                         |
| grayscale.jpg → webp @ 640           | 48.2 ms (48.2 ms–48.2 ms)    | 66.5 ms (66.5 ms–66.5 ms)    | 1.38×         | 49.6 KB      | 49.6 KB    | identical bytes                                                         |
| grayscale.jpg → avif @ 640           | 227.4 ms (227.4 ms–227.4 ms) | 589.8 ms (589.8 ms–589.8 ms) | 2.59×         | 24.3 KB      | 24.3 KB    | identical bytes                                                         |
| grayscale.jpg → jpg @ 640            | 45.5 ms (45.5 ms–45.5 ms)    | 80.6 ms (80.6 ms–80.6 ms)    | 1.77×         | 45.3 KB      | 45.3 KB    | identical bytes                                                         |
| grayscale.jpg → png @ 640            | 45.3 ms (45.3 ms–45.3 ms)    | 65.5 ms (65.5 ms–65.5 ms)    | 1.45×         | 103.8 KB     | 103.8 KB   | pixels differ: max Δ7 on 3 of 1093120 samples (0.00027%), PSNR 86.8 dB  |
| icc-p3.jpg → webp @ 640              | 74.3 ms (74.3 ms–74.3 ms)    | 124.1 ms (124.1 ms–124.1 ms) | 1.67×         | 51.8 KB      | 51.8 KB    | identical bytes                                                         |
| icc-p3.jpg → avif @ 640              | 273.0 ms (273.0 ms–273.0 ms) | 780.3 ms (780.3 ms–780.3 ms) | 2.86×         | 25.5 KB      | 25.5 KB    | identical bytes                                                         |
| icc-p3.jpg → jpg @ 640               | 82.2 ms (82.2 ms–82.2 ms)    | 125.3 ms (125.3 ms–125.3 ms) | 1.53×         | 48.0 KB      | 48.0 KB    | identical bytes                                                         |
| icc-p3.jpg → png @ 640               | 334.8 ms (334.8 ms–334.8 ms) | 368.4 ms (368.4 ms–368.4 ms) | 1.10×         | 167.4 KB     | 167.4 KB   | identical bytes                                                         |
| lossless.webp → webp @ 640           | 77.4 ms (77.4 ms–77.4 ms)    | 146.2 ms (146.2 ms–146.2 ms) | 1.89×         | 46.7 KB      | 46.7 KB    | identical bytes                                                         |
| lossless.webp → avif @ 640           | 277.0 ms (277.0 ms–277.0 ms) | 847.1 ms (847.1 ms–847.1 ms) | 3.06×         | 23.2 KB      | 23.2 KB    | identical bytes                                                         |
| lossless.webp → jpg @ 640            | 75.7 ms (75.7 ms–75.7 ms)    | 109.3 ms (109.3 ms–109.3 ms) | 1.44×         | 44.6 KB      | 44.6 KB    | identical bytes                                                         |
| lossless.webp → png @ 640            | 311.8 ms (311.8 ms–311.8 ms) | 331.5 ms (331.5 ms–331.5 ms) | 1.06×         | 169.9 KB     | 169.9 KB   | pixels differ: max Δ18 on 6 of 1093120 samples (0.00055%), PSNR 77.6 dB |
| photo.avif → webp @ 640              | 115.9 ms (115.9 ms–115.9 ms) | 205.6 ms (205.6 ms–205.6 ms) | 1.77×         | 51.0 KB      | 51.0 KB    | identical bytes                                                         |
| photo.avif → avif @ 640              | 311.4 ms (311.4 ms–311.4 ms) | 822.2 ms (822.2 ms–822.2 ms) | 2.64×         | 25.5 KB      | 25.5 KB    | identical bytes                                                         |
| photo.avif → jpg @ 640               | 103.6 ms (103.6 ms–103.6 ms) | 190.9 ms (190.9 ms–190.9 ms) | 1.84×         | 47.7 KB      | 47.7 KB    | identical bytes                                                         |
| photo.avif → png @ 640               | 294.0 ms (294.0 ms–294.0 ms) | 378.2 ms (378.2 ms–378.2 ms) | 1.29×         | 151.3 KB     | 151.3 KB   | pixels differ: max Δ15 on 12 of 1093120 samples (0.0011%), PSNR 79.2 dB |
| photo.tiff → webp @ 640              | 50.1 ms (50.1 ms–50.1 ms)    | 72.9 ms (72.9 ms–72.9 ms)    | 1.46×         | 51.6 KB      | 51.6 KB    | identical bytes                                                         |
| photo.tiff → avif @ 640              | 257.2 ms (257.2 ms–257.2 ms) | 737.7 ms (737.7 ms–737.7 ms) | 2.87×         | 25.4 KB      | 25.4 KB    | identical bytes                                                         |
| photo.tiff → jpg @ 640               | 49.1 ms (49.1 ms–49.1 ms)    | 82.0 ms (82.0 ms–82.0 ms)    | 1.67×         | 48.0 KB      | 48.0 KB    | identical bytes                                                         |
| photo.tiff → png @ 640               | 298.4 ms (298.4 ms–298.4 ms) | 316.0 ms (316.0 ms–316.0 ms) | 1.06×         | 162.9 KB     | 162.9 KB   | identical bytes                                                         |
| progressive.jpg → webp @ 640         | 55.7 ms (55.7 ms–55.7 ms)    | 83.0 ms (83.0 ms–83.0 ms)    | 1.49×         | 52.2 KB      | 52.2 KB    | identical bytes                                                         |
| progressive.jpg → avif @ 640         | 278.5 ms (278.5 ms–278.5 ms) | 781.0 ms (781.0 ms–781.0 ms) | 2.80×         | 25.4 KB      | 25.4 KB    | identical bytes                                                         |
| progressive.jpg → jpg @ 640          | 61.4 ms (61.4 ms–61.4 ms)    | 95.6 ms (95.6 ms–95.6 ms)    | 1.56×         | 48.0 KB      | 48.0 KB    | identical bytes                                                         |
| progressive.jpg → png @ 640          | 300.2 ms (300.2 ms–300.2 ms) | 327.1 ms (327.1 ms–327.1 ms) | 1.09×         | 164.0 KB     | 164.0 KB   | pixels differ: max Δ17 on 6 of 1093120 samples (0.00055%), PSNR 78.7 dB |
| static.gif → webp @ 640              | 61.5 ms (61.5 ms–61.5 ms)    | 73.8 ms (73.8 ms–73.8 ms)    | 1.20×         | 51.8 KB      | 51.8 KB    | identical bytes                                                         |
| static.gif → avif @ 640              | 267.1 ms (267.1 ms–267.1 ms) | 753.6 ms (753.6 ms–753.6 ms) | 2.82×         | 25.4 KB      | 25.4 KB    | identical bytes                                                         |
| static.gif → jpg @ 640               | 52.2 ms (52.2 ms–52.2 ms)    | 87.4 ms (87.4 ms–87.4 ms)    | 1.67×         | 47.9 KB      | 47.9 KB    | identical bytes                                                         |
| static.gif → png @ 640               | 206.1 ms (206.1 ms–206.1 ms) | 231.8 ms (231.8 ms–231.8 ms) | 1.12×         | 157.3 KB     | 157.3 KB   | pixels differ: max Δ17 on 6 of 1093120 samples (0.00055%), PSNR 77.2 dB |

## Summary

| Output  | combinations | geometric mean wasm / native | byte-identical | pixel-identical | pixel differences | failures |
| ------- | ------------ | ---------------------------- | -------------- | --------------- | ----------------- | -------- |
| webp    | 12           | 1.70×                        | 12             | 0               | 0                 | 0        |
| avif    | 12           | 2.92×                        | 12             | 0               | 0                 | 0        |
| jpg     | 12           | 1.64×                        | 12             | 0               | 0                 | 0        |
| png     | 12           | 1.18×                        | 5              | 0               | 7                 | 0        |
| **all** | 48           | 1.76×                        | 41             | 0               | 7                 | 0        |
