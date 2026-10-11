# Image optimizer: native sharp vs WebAssembly sharp

## Environment

- Node.js v22.22.2, linux-x64 (6.18.49)
- CPU: Intel(R) Xeon(R) Processor @ 2.90GHz × 4, 8.2 GiB RAM
- sharp 0.35.4
- native: `@img/sharp-linux-x64` — libvips 8.18.6, aom 3.15.0, libheif 1.23.2, libwebp 1.6.0, mozjpeg 0826579, libpng 1.6.58, highway 1.4.0; sharp.concurrency() = 4
- wasm: `@img/sharp-wasm32` — libvips 8.18.6, aom 3.14.1, libheif 1.23.2, libwebp 1.6.0, mozjpeg 0826579, libpng 1.6.58, highway 1.4.0, emscripten 6.0.8; sharp.concurrency() = 4
- optimizeImage() options: quality 75, concurrency 4, operation cache false, timeout 7s, limitInputPixels 268402689, mozjpeg true
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
| native  | 38.8 ms  | 914.04 MB |
| wasm    | 111.7 ms | 717.55 MB |

## Results

Median wall time of `optimizeImage()` per combination. "wasm / native" is the ratio of medians. Parity compares the two outputs: byte-identical, or decoded-pixel-identical, or the pixel difference.

| Source → output @ width                     | native median (min–p95)      | wasm median (min–p95)        | wasm / native | native bytes | wasm bytes | parity                                                                   |
| ------------------------------------------- | ---------------------------- | ---------------------------- | ------------- | ------------ | ---------- | ------------------------------------------------------------------------ |
| synthetic-photo-4000x3000.jpg → webp @ 1920 | 355.5 ms (349.7 ms–365.6 ms) | 532.3 ms (512.6 ms–671.6 ms) | 1.50×         | 63.2 KB      | 63.2 KB    | identical bytes                                                          |
| synthetic-photo-4000x3000.jpg → webp @ 640  | 94.5 ms (90.8 ms–103.4 ms)   | 131.1 ms (123.6 ms–136.3 ms) | 1.39×         | 14.8 KB      | 14.8 KB    | identical bytes                                                          |
| synthetic-photo-4000x3000.jpg → avif @ 1920 | 362.4 ms (345.7 ms–386.2 ms) | 4.40 s (4.33 s–4.52 s)       | 12.15×        | 29.5 KB      | 29.5 KB    | identical bytes                                                          |
| synthetic-photo-4000x3000.jpg → avif @ 640  | 109.1 ms (105.9 ms–112.3 ms) | 687.4 ms (654.2 ms–754.4 ms) | 6.30×         | 8.5 KB       | 8.5 KB     | pixels differ: max Δ3 on 57862 of 1228800 samples (4.7%), PSNR 58.9 dB   |
| synthetic-photo-4000x3000.jpg → jpg @ 1920  | 243.2 ms (238.2 ms–245.8 ms) | 386.3 ms (383.5 ms–393.4 ms) | 1.59×         | 126.2 KB     | 126.2 KB   | identical bytes                                                          |
| synthetic-photo-4000x3000.jpg → jpg @ 640   | 84.4 ms (83.3 ms–87.8 ms)    | 113.1 ms (111.4 ms–118.6 ms) | 1.34×         | 22.1 KB      | 22.1 KB    | identical bytes                                                          |
| synthetic-photo-4000x3000.jpg → png @ 1920  | 727.7 ms (707.6 ms–746.7 ms) | 846.0 ms (841.8 ms–1.00 s)   | 1.16×         | 555.9 KB     | 555.9 KB   | identical bytes                                                          |
| synthetic-photo-4000x3000.jpg → png @ 640   | 156.0 ms (154.6 ms–176.4 ms) | 185.0 ms (178.2 ms–189.1 ms) | 1.19×         | 38.9 KB      | 38.9 KB    | pixels differ: max Δ5 on 30 of 1228800 samples (0.0024%), PSNR 83.2 dB   |
| synthetic-photo-4000x3000.png → webp @ 1920 | 425.6 ms (401.2 ms–457.0 ms) | 545.7 ms (539.7 ms–546.6 ms) | 1.28×         | 64.6 KB      | 64.6 KB    | identical bytes                                                          |
| synthetic-photo-4000x3000.png → webp @ 640  | 189.3 ms (185.2 ms–223.6 ms) | 267.8 ms (266.7 ms–274.3 ms) | 1.41×         | 14.9 KB      | 14.9 KB    | identical bytes                                                          |
| synthetic-photo-4000x3000.png → avif @ 1920 | 410.0 ms (398.5 ms–431.2 ms) | 4.41 s (4.36 s–4.47 s)       | 10.75×        | 29.5 KB      | 29.5 KB    | identical bytes                                                          |
| synthetic-photo-4000x3000.png → avif @ 640  | 206.6 ms (201.0 ms–208.1 ms) | 808.5 ms (792.9 ms–924.9 ms) | 3.91×         | 8.6 KB       | 8.6 KB     | pixels differ: max Δ5 on 38406 of 1228800 samples (3.1%), PSNR 59.5 dB   |
| synthetic-photo-4000x3000.png → jpg @ 1920  | 308.9 ms (294.7 ms–337.9 ms) | 503.2 ms (466.2 ms–531.5 ms) | 1.63×         | 126.0 KB     | 126.0 KB   | identical bytes                                                          |
| synthetic-photo-4000x3000.png → jpg @ 640   | 181.8 ms (179.9 ms–185.8 ms) | 313.1 ms (285.4 ms–355.8 ms) | 1.72×         | 22.3 KB      | 22.3 KB    | identical bytes                                                          |
| synthetic-photo-4000x3000.png → png @ 1920  | 729.7 ms (716.1 ms–743.2 ms) | 870.2 ms (869.3 ms–939.6 ms) | 1.19×         | 516.6 KB     | 516.6 KB   | identical bytes                                                          |
| synthetic-photo-4000x3000.png → png @ 640   | 244.6 ms (236.1 ms–268.3 ms) | 337.6 ms (325.7 ms–391.2 ms) | 1.38×         | 37.4 KB      | 37.4 KB    | pixels differ: max Δ5 on 129 of 1228800 samples (0.010%), PSNR 76.9 dB   |
| app.png → webp @ 1920                       | 332.4 ms (329.7 ms–343.2 ms) | 522.7 ms (516.3 ms–544.2 ms) | 1.57×         | 229.0 KB     | 229.0 KB   | identical bytes                                                          |
| app.png → webp @ 640                        | 120.4 ms (118.7 ms–134.1 ms) | 217.3 ms (207.3 ms–245.5 ms) | 1.80×         | 24.9 KB      | 24.9 KB    | identical bytes                                                          |
| app.png → avif @ 1920                       | 483.0 ms (461.0 ms–494.9 ms) | 5.94 s (5.07 s–6.04 s)       | 12.30×        | 66.2 KB      | 66.2 KB    | pixels differ: max Δ5 on 35682 of 10483200 samples (0.34%), PSNR 70.6 dB |
| app.png → avif @ 640                        | 156.7 ms (144.2 ms–170.8 ms) | 874.6 ms (811.0 ms–885.3 ms) | 5.58×         | 11.2 KB      | 11.2 KB    | pixels differ: max Δ5 on 13849 of 1164800 samples (1.2%), PSNR 65.2 dB   |
| app.png → jpg @ 1920                        | 318.9 ms (316.4 ms–320.5 ms) | 714.1 ms (713.2 ms–774.5 ms) | 2.24×         | 232.9 KB     | 232.9 KB   | identical bytes                                                          |
| app.png → jpg @ 640                         | 116.9 ms (114.0 ms–121.3 ms) | 224.1 ms (207.9 ms–237.8 ms) | 1.92×         | 23.6 KB      | 23.6 KB    | identical bytes                                                          |
| app.png → png @ 1920                        | 1.15 s (1.13 s–1.36 s)       | 1.51 s (1.36 s–1.69 s)       | 1.31×         | 449.6 KB     | 449.6 KB   | identical bytes                                                          |
| app.png → png @ 640                         | 354.5 ms (345.0 ms–363.8 ms) | 483.1 ms (471.8 ms–488.0 ms) | 1.36×         | 69.5 KB      | 69.5 KB    | identical bytes                                                          |
| nasa-earth.jpg → webp @ 1920                | 669.2 ms (654.8 ms–680.8 ms) | 1.17 s (1.12 s–1.29 s)       | 1.74×         | 249.2 KB     | 249.2 KB   | identical bytes                                                          |
| nasa-earth.jpg → webp @ 640                 | 198.8 ms (184.9 ms–220.0 ms) | 333.2 ms (324.5 ms–354.5 ms) | 1.68×         | 54.3 KB      | 54.3 KB    | identical bytes                                                          |
| nasa-earth.jpg → avif @ 1920                | 831.6 ms (820.2 ms–897.0 ms) | 8.16 s (8.08 s–9.02 s)       | 9.81×         | 150.4 KB     | 150.3 KB   | pixels differ: max Δ8 on 965651 of 14753280 samples (6.5%), PSNR 56.4 dB |
| nasa-earth.jpg → avif @ 640                 | 228.6 ms (220.6 ms–240.4 ms) | 1.18 s (1.15 s–1.52 s)       | 5.17×         | 28.0 KB      | 28.0 KB    | pixels differ: max Δ2 on 111585 of 1638400 samples (6.8%), PSNR 56.3 dB  |
| nasa-earth.jpg → jpg @ 1920                 | 601.3 ms (585.2 ms–620.8 ms) | 1.17 s (1.11 s–1.36 s)       | 1.94×         | 327.4 KB     | 327.4 KB   | identical bytes                                                          |
| nasa-earth.jpg → jpg @ 640                  | 188.5 ms (178.8 ms–192.0 ms) | 354.1 ms (338.6 ms–373.9 ms) | 1.88×         | 54.3 KB      | 54.3 KB    | identical bytes                                                          |
| nasa-earth.jpg → png @ 1920                 | 2.43 s (2.35 s–2.86 s)       | 2.81 s (2.66 s–3.63 s)       | 1.16×         | 1.96 MB      | 1.96 MB    | identical bytes                                                          |
| nasa-earth.jpg → png @ 640                  | 533.9 ms (485.4 ms–577.4 ms) | 649.8 ms (619.8 ms–672.9 ms) | 1.22×         | 225.8 KB     | 225.8 KB   | identical bytes                                                          |
| nasa-earth.png → webp @ 1920                | 523.2 ms (499.5 ms–649.6 ms) | 657.4 ms (652.8 ms–771.8 ms) | 1.26×         | 249.2 KB     | 249.2 KB   | identical bytes                                                          |
| nasa-earth.png → webp @ 640                 | 183.3 ms (178.8 ms–205.2 ms) | 239.3 ms (234.4 ms–246.3 ms) | 1.31×         | 54.4 KB      | 54.4 KB    | identical bytes                                                          |
| nasa-earth.png → avif @ 1920                | 782.0 ms (768.0 ms–817.4 ms) | 7.77 s (7.62 s–8.12 s)       | 9.93×         | 150.4 KB     | 150.3 KB   | pixels differ: max Δ8 on 965651 of 14753280 samples (6.5%), PSNR 56.4 dB |
| nasa-earth.png → avif @ 640                 | 249.2 ms (235.3 ms–255.7 ms) | 1.07 s (1.06 s–1.09 s)       | 4.29×         | 28.0 KB      | 28.0 KB    | pixels differ: max Δ2 on 110954 of 1638400 samples (6.8%), PSNR 56.3 dB  |
| nasa-earth.png → jpg @ 1920                 | 411.8 ms (405.3 ms–419.1 ms) | 610.2 ms (604.8 ms–651.2 ms) | 1.48×         | 327.4 KB     | 327.4 KB   | identical bytes                                                          |
| nasa-earth.png → jpg @ 640                  | 176.5 ms (176.3 ms–176.8 ms) | 249.5 ms (244.2 ms–251.5 ms) | 1.41×         | 54.3 KB      | 54.3 KB    | identical bytes                                                          |
| nasa-earth.png → png @ 1920                 | 2.19 s (2.12 s–2.46 s)       | 2.31 s (2.22 s–2.51 s)       | 1.05×         | 1.96 MB      | 1.96 MB    | identical bytes                                                          |
| nasa-earth.png → png @ 640                  | 441.3 ms (435.6 ms–468.8 ms) | 506.8 ms (488.1 ms–595.7 ms) | 1.15×         | 228.1 KB     | 228.1 KB   | identical bytes                                                          |

## Summary

| Output  | combinations | geometric mean wasm / native | byte-identical | pixel-identical | pixel differences | failures |
| ------- | ------------ | ---------------------------- | -------------- | --------------- | ----------------- | -------- |
| webp    | 10           | 1.48×                        | 10             | 0               | 0                 | 0        |
| avif    | 10           | 7.38×                        | 2              | 0               | 8                 | 0        |
| jpg     | 10           | 1.69×                        | 10             | 0               | 0                 | 0        |
| png     | 10           | 1.21×                        | 8              | 0               | 2                 | 0        |
| **all** | 40           | 2.18×                        | 30             | 0               | 10                | 0        |
