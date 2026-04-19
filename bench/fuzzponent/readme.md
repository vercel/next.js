# Fuzzponent

Originally built by [Dale Bustad](https://github.com/divmain/fuzzponent) while at Vercel.

[Original repository](https://github.com/divmain/fuzzponent).

Generate a nested React component dependency graph, useful for benchmarking.

## Example

To create a dependency tree with `3020` files in the `components` directory:

```
fuzzponent --depth 2 --seed 206 --outdir components
```

You can then import the entrypoint of the dependency tree at `components/index.js`.

## Options

```
Options:
      --help       Show help                                           [boolean]
      --version    Show version number                                 [boolean]
  -d, --depth      component hierarchy depth                 [number] [required]
  -s, --seed       prng seed                                 [number] [required]
  -o, --outdir     the directory where components should be written
     [string] [default: "/Users/timneutkens/projects/next.js/bench/nested-deps"]
      --minLen     the smallest acceptable component name length
                                                          [number] [default: 18]
      --maxLen     the largest acceptable component name length
                                                          [number] [default: 24]
      --minChild   the smallest number of acceptable component children
                                                           [number] [default: 4]
      --maxChild   the largest number of acceptable component children
                                                          [number] [default: 80]
      --extension  extension to use for generated components
                                                       [string] [default: "jsx"]
```
