# turbopack-nft

A CLI to test the NFT implementation, similar to `@vercel/nft`'s `nft print index.js` CLI.

## Usage

```
Usage: turbopack-nft [OPTIONS] <ENTRY>

Arguments:
  <ENTRY>

Options:
      --graph
      --show-issues
  -h, --help         Print help
  -V, --version      Print version
```

Use no arguments to print a list of all files referenced (but not necessarily bundled!) by the entry.

```
$ cargo run -p turbopack-nft bench/heavy-npm-deps/app/page.js
FILELIST:
bench/heavy-npm-deps/app/page.js
bench/heavy-npm-deps/components/lodash.js
bench/heavy-npm-deps/node_modules/lodash-es
bench/heavy-npm-deps/package.json
node_modules/.pnpm/lodash-es@4.17.21/node_modules/lodash-es/_DataView.js
node_modules/.pnpm/lodash-es@4.17.21/node_modules/lodash-es/_Hash.js
node_modules/.pnpm/lodash-es@4.17.21/node_modules/lodash-es/_LazyWrapper.js
node_modules/.pnpm/lodash-es@4.17.21/node_modules/lodash-es/_ListCache.js
node_modules/.pnpm/lodash-es@4.17.21/node_modules/lodash-es/_LodashWrapper.js
node_modules/.pnpm/lodash-es@4.17.21/node_modules/lodash-es/_Map.js
```

Use `--graph` to print a crude visualization of the module graph to determine why certain files were included:
```
$ cargo run -p turbopack-nft bench/heavy-npm-deps/app/page.js --graph
FILELIST:
[workspace]/bench/heavy-npm-deps/app/page.js
  [workspace]/bench/heavy-npm-deps/components/lodash.js
    [workspace]/node_modules/.pnpm/lodash-es@4.17.21/node_modules/lodash-es/package.json
    [workspace]/bench/heavy-npm-deps/node_modules/lodash-es
    [workspace]/node_modules/.pnpm/lodash-es@4.17.21/node_modules/lodash-es/lodash.js
      [workspace]/node_modules/.pnpm/lodash-es@4.17.21/node_modules/lodash-es/add.js
        [workspace]/node_modules/.pnpm/lodash-es@4.17.21/node_modules/lodash-es/_createMathOperation.js
```


By default, no warnings and errors are printed (aligning with the Next.js Turbopack behavior which silences any tracing warnings in node_modules as they are non-actionable anyway), but can be enabled with `--show-issues`:
```
$ cargo run -p turbopack-nft ... --show-issues
[workspace]/packages/next/dist/build/jest/jest.js
  [workspace]/packages/next/dist/build/jest/jest.js:101:15  Module not found: Can't resolve <dynamic>

      97 |         });
      98 |     }
      99 |     var mainPath = attempts === 1 ? './' : Array(attempts).join('../');
      100 |     try {
          +                v------------------------------------------------------v
      101 +         return require((0, _path.join)(dir, mainPath + 'package.json'));
          +                ^------------------------------------------------------^
      102 |     } catch (e) {
      103 |         return loadClosestPackageJson(dir, attempts + 1);
      104 |     }
      105 | }


FILELIST:
...
```
