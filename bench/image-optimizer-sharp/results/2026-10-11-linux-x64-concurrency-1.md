# Image optimizer: native sharp vs WebAssembly sharp

## Environment

- Node.js v22.22.2, linux-x64 (6.18.49)
- CPU: Intel(R) Xeon(R) Processor @ 2.90GHz × 4, 8.2 GiB RAM
- sharp 0.35.4
- native: `@img/sharp-linux-x64` — libvips 8.18.6, aom 3.15.0, libheif 1.23.2, libwebp 1.6.0, mozjpeg 0826579, libpng 1.6.58, highway 1.4.0; sharp.concurrency() = 1
- wasm: `@img/sharp-wasm32` — libvips 8.18.6, aom 3.14.1, libheif 1.23.2, libwebp 1.6.0, mozjpeg 0826579, libpng 1.6.58, highway 1.4.0, emscripten 6.0.8; sharp.concurrency() = 1
- optimizeImage() options: quality 75, concurrency Next.js default, operation cache false, timeout 7s, limitInputPixels 268402689, mozjpeg true
- 5 timed iterations after 1 warmup run(s) per combination; each variant runs in its own process, variants run sequentially

## Sources

| Source                        | Type       | Dimensions | Size     |
| ----------------------------- | ---------- | ---------- | -------- |
| synthetic-photo-4000x3000.jpg | image/jpeg | 4000×3000  | 4.32 MB  |
| synthetic-photo-4000x3000.png | image/png  | 4000×3000  | 18.29 MB |
| app.png                       | image/png  | 2880×2048  | 3.28 MB  |
| nasa-earth.jpg                | image/jpeg | 3000×3002  | 6.21 MB  |
| nasa-earth.png                | image/png  | 3000×3002  | 19.10 MB |

## Startup

Time to `require('sharp')` and configure it (for wasm32 this includes compiling and instantiating the WebAssembly module), and peak RSS of the worker process over the whole run.

| Variant | Load     | Peak RSS  |
| ------- | -------- | --------- |
| native  | 41.3 ms  | 674.94 MB |
| wasm    | 119.6 ms | 693.09 MB |

## Results

Median wall time of `optimizeImage()` per combination. "wasm / native" is the ratio of medians. Parity compares the two outputs: byte-identical, or decoded-pixel-identical, or the pixel difference.

| Source → output @ width                     | native median (min–p95)      | wasm median (min–p95)        | wasm / native | native bytes | wasm bytes | parity                                                                 |
| ------------------------------------------- | ---------------------------- | ---------------------------- | ------------- | ------------ | ---------- | ---------------------------------------------------------------------- |
| synthetic-photo-4000x3000.jpg → webp @ 1920 | 484.6 ms (395.8 ms–539.0 ms) | 570.9 ms (556.3 ms–673.3 ms) | 1.18×         | 63.2 KB      | 63.2 KB    | identical bytes                                                        |
| synthetic-photo-4000x3000.jpg → webp @ 640  | 103.1 ms (96.8 ms–149.9 ms)  | 129.2 ms (125.1 ms–131.6 ms) | 1.25×         | 14.8 KB      | 14.8 KB    | identical bytes                                                        |
| synthetic-photo-4000x3000.jpg → avif @ 1920 | 1.00 s (946.1 ms–1.24 s)     | 4.46 s (4.39 s–4.90 s)       | 4.44×         | 28.9 KB      | 28.9 KB    | identical bytes                                                        |
| synthetic-photo-4000x3000.jpg → avif @ 640  | 201.3 ms (198.4 ms–207.3 ms) | 684.6 ms (672.9 ms–982.4 ms) | 3.40×         | 8.3 KB       | 8.3 KB     | identical bytes                                                        |
| synthetic-photo-4000x3000.jpg → jpg @ 1920  | 277.2 ms (271.4 ms–289.6 ms) | 449.5 ms (445.7 ms–473.1 ms) | 1.62×         | 126.2 KB     | 126.2 KB   | identical bytes                                                        |
| synthetic-photo-4000x3000.jpg → jpg @ 640   | 93.2 ms (87.0 ms–107.8 ms)   | 120.2 ms (117.5 ms–123.0 ms) | 1.29×         | 22.1 KB      | 22.1 KB    | identical bytes                                                        |
| synthetic-photo-4000x3000.jpg → png @ 1920  | 769.6 ms (736.4 ms–837.7 ms) | 930.3 ms (915.5 ms–1.06 s)   | 1.21×         | 555.9 KB     | 555.9 KB   | identical bytes                                                        |
| synthetic-photo-4000x3000.jpg → png @ 640   | 156.5 ms (155.5 ms–159.8 ms) | 208.1 ms (190.1 ms–228.7 ms) | 1.33×         | 38.9 KB      | 38.9 KB    | pixels differ: max Δ5 on 30 of 1228800 samples (0.0024%), PSNR 83.2 dB |
| synthetic-photo-4000x3000.png → webp @ 1920 | 417.5 ms (407.3 ms–419.6 ms) | 655.8 ms (612.6 ms–667.2 ms) | 1.57×         | 64.6 KB      | 64.6 KB    | identical bytes                                                        |
| synthetic-photo-4000x3000.png → webp @ 640  | 198.4 ms (187.7 ms–198.7 ms) | 268.9 ms (267.8 ms–277.6 ms) | 1.36×         | 14.9 KB      | 14.9 KB    | identical bytes                                                        |
| synthetic-photo-4000x3000.png → avif @ 1920 | 1.00 s (972.3 ms–1.03 s)     | 4.54 s (4.47 s–5.26 s)       | 4.54×         | 29.0 KB      | 29.0 KB    | identical bytes                                                        |
| synthetic-photo-4000x3000.png → avif @ 640  | 297.3 ms (296.2 ms–302.0 ms) | 841.8 ms (817.3 ms–896.2 ms) | 2.83×         | 8.5 KB       | 8.5 KB     | identical bytes                                                        |
| synthetic-photo-4000x3000.png → jpg @ 1920  | 313.2 ms (306.0 ms–317.3 ms) | 499.1 ms (488.4 ms–593.9 ms) | 1.59×         | 126.0 KB     | 126.0 KB   | identical bytes                                                        |
| synthetic-photo-4000x3000.png → jpg @ 640   | 181.5 ms (176.9 ms–188.3 ms) | 269.9 ms (267.9 ms–382.8 ms) | 1.49×         | 22.3 KB      | 22.3 KB    | identical bytes                                                        |
| synthetic-photo-4000x3000.png → png @ 1920  | 744.5 ms (724.4 ms–774.1 ms) | 967.0 ms (936.2 ms–1.06 s)   | 1.30×         | 516.6 KB     | 516.6 KB   | identical bytes                                                        |
| synthetic-photo-4000x3000.png → png @ 640   | 238.6 ms (231.9 ms–240.7 ms) | 325.9 ms (317.2 ms–381.2 ms) | 1.37×         | 37.4 KB      | 37.4 KB    | pixels differ: max Δ5 on 129 of 1228800 samples (0.010%), PSNR 76.9 dB |
| app.png → webp @ 1920                       | 340.2 ms (338.2 ms–347.8 ms) | 571.9 ms (563.9 ms–611.6 ms) | 1.68×         | 229.0 KB     | 229.0 KB   | identical bytes                                                        |
| app.png → webp @ 640                        | 119.9 ms (118.1 ms–120.8 ms) | 235.8 ms (225.6 ms–253.4 ms) | 1.97×         | 24.9 KB      | 24.9 KB    | identical bytes                                                        |
| app.png → avif @ 1920                       | 1.24 s (1.23 s–1.43 s)       | 4.79 s (4.75 s–5.96 s)       | 3.88×         | 65.8 KB      | 65.8 KB    | identical bytes                                                        |
| app.png → avif @ 640                        | 311.1 ms (258.8 ms–402.5 ms) | 797.3 ms (772.5 ms–898.5 ms) | 2.56×         | 10.8 KB      | 10.8 KB    | identical bytes                                                        |
| app.png → jpg @ 1920                        | 356.5 ms (349.9 ms–410.6 ms) | 642.9 ms (626.8 ms–687.7 ms) | 1.80×         | 232.9 KB     | 232.9 KB   | identical bytes                                                        |
| app.png → jpg @ 640                         | 129.2 ms (121.1 ms–161.8 ms) | 207.1 ms (204.4 ms–239.8 ms) | 1.60×         | 23.6 KB      | 23.6 KB    | identical bytes                                                        |
| app.png → png @ 1920                        | 1.18 s (1.15 s–1.28 s)       | 1.37 s (1.36 s–1.39 s)       | 1.16×         | 449.6 KB     | 449.6 KB   | identical bytes                                                        |
| app.png → png @ 640                         | 342.0 ms (334.0 ms–348.6 ms) | 477.0 ms (461.0 ms–526.7 ms) | 1.39×         | 69.5 KB      | 69.5 KB    | identical bytes                                                        |
| nasa-earth.jpg → webp @ 1920                | 690.6 ms (687.0 ms–713.0 ms) | 1.18 s (1.14 s–1.27 s)       | 1.71×         | 249.2 KB     | 249.2 KB   | identical bytes                                                        |
| nasa-earth.jpg → webp @ 640                 | 187.2 ms (186.3 ms–193.1 ms) | 322.3 ms (318.4 ms–342.6 ms) | 1.72×         | 54.3 KB      | 54.3 KB    | identical bytes                                                        |
| nasa-earth.jpg → avif @ 1920                | 2.19 s (2.18 s–2.33 s)       | 8.36 s (8.26 s–9.49 s)       | 3.81×         | 150.1 KB     | 150.1 KB   | identical bytes                                                        |
| nasa-earth.jpg → avif @ 640                 | 430.9 ms (422.9 ms–442.7 ms) | 1.21 s (1.18 s–1.32 s)       | 2.81×         | 27.7 KB      | 27.7 KB    | identical bytes                                                        |
| nasa-earth.jpg → jpg @ 1920                 | 590.1 ms (579.9 ms–622.7 ms) | 1.13 s (1.08 s–1.25 s)       | 1.92×         | 327.4 KB     | 327.4 KB   | identical bytes                                                        |
| nasa-earth.jpg → jpg @ 640                  | 193.8 ms (187.9 ms–213.2 ms) | 345.1 ms (335.5 ms–351.7 ms) | 1.78×         | 54.3 KB      | 54.3 KB    | identical bytes                                                        |
| nasa-earth.jpg → png @ 1920                 | 2.49 s (2.25 s–2.54 s)       | 2.84 s (2.81 s–2.96 s)       | 1.14×         | 1.96 MB      | 1.96 MB    | identical bytes                                                        |
| nasa-earth.jpg → png @ 640                  | 497.4 ms (478.3 ms–568.9 ms) | 654.8 ms (628.1 ms–696.5 ms) | 1.32×         | 225.8 KB     | 225.8 KB   | identical bytes                                                        |
| nasa-earth.png → webp @ 1920                | 512.1 ms (497.4 ms–545.6 ms) | 721.4 ms (715.5 ms–737.0 ms) | 1.41×         | 249.2 KB     | 249.2 KB   | identical bytes                                                        |
| nasa-earth.png → webp @ 640                 | 172.0 ms (170.1 ms–178.5 ms) | 254.4 ms (237.3 ms–265.1 ms) | 1.48×         | 54.4 KB      | 54.4 KB    | identical bytes                                                        |
| nasa-earth.png → avif @ 1920                | 2.04 s (2.00 s–2.51 s)       | 7.76 s (7.74 s–8.14 s)       | 3.81×         | 150.1 KB     | 150.1 KB   | identical bytes                                                        |
| nasa-earth.png → avif @ 640                 | 421.7 ms (409.9 ms–449.9 ms) | 1.18 s (1.14 s–1.25 s)       | 2.79×         | 27.6 KB      | 27.6 KB    | identical bytes                                                        |
| nasa-earth.png → jpg @ 1920                 | 418.5 ms (408.0 ms–424.9 ms) | 750.6 ms (732.7 ms–947.5 ms) | 1.79×         | 327.4 KB     | 327.4 KB   | identical bytes                                                        |
| nasa-earth.png → jpg @ 640                  | 172.1 ms (167.4 ms–194.6 ms) | 262.2 ms (250.4 ms–282.4 ms) | 1.52×         | 54.3 KB      | 54.3 KB    | identical bytes                                                        |
| nasa-earth.png → png @ 1920                 | 2.22 s (2.10 s–2.38 s)       | 2.44 s (2.39 s–2.55 s)       | 1.10×         | 1.96 MB      | 1.96 MB    | identical bytes                                                        |
| nasa-earth.png → png @ 640                  | 436.8 ms (430.2 ms–445.1 ms) | 514.4 ms (507.5 ms–539.0 ms) | 1.18×         | 228.1 KB     | 228.1 KB   | identical bytes                                                        |

## Summary

| Output  | combinations | geometric mean wasm / native | byte-identical | pixel-identical | pixel differences | failures |
| ------- | ------------ | ---------------------------- | -------------- | --------------- | ----------------- | -------- |
| webp    | 10           | 1.51×                        | 10             | 0               | 0                 | 0        |
| avif    | 10           | 3.42×                        | 10             | 0               | 0                 | 0        |
| jpg     | 10           | 1.63×                        | 10             | 0               | 0                 | 0        |
| png     | 10           | 1.25×                        | 8              | 0               | 2                 | 0        |
| **all** | 40           | 1.80×                        | 38             | 0               | 2                 | 0        |
