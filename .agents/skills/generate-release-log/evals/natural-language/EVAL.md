### Core Changes

- Add eval and docs for unstable_instant: #91334
- Turboopack: put import attributes behind a pointer, 23% faster analyze: #91347
- Turbopack: `require(/* turbopackChunkingType: parallel */`: #91278
- Simplify scroll restoration with shared ScrollRef on CacheNode: #91348
- Turbopack: use keyed cell access for AsyncModulesInfo: #91305
- Enable thin LTO for release builds: #91343
- [turbopack] const-ify most of the registration code: #90868

### Misc Changes

- disable sub shell generation test outside of adapter: #91353

### Credits

Huge thanks to @acdlite, @gaojude, @mischnic, @mmastrac, @sokra, and @ztanner for helping!
