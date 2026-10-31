use turbopack_core::chunk::chunking::DEFAULT_ESTIMATED_REQUEST_COST_BYTES;

/// Scale of the default chunk size limits when chunk items are minified before chunking, in
/// percent of the unminified defaults.
const MINIFIED_SIZE_PERCENT: usize = 40;

/// Scale of the default request cost when chunk items are minified before chunking, in percent of
/// the unminified default.
const MINIFIED_REQUEST_COST_PERCENT: u64 = 40;

/// Defaults for the production chunking size limits and request cost.
///
/// The defaults are tuned for chunk items measured by their unminified code. When chunk items are
/// minified one by one before chunking (`turbopackMinifyBeforeChunking`, which only applies when
/// minification is enabled), chunking measures their minified code instead, which is a few times
/// smaller, so the defaults are scaled down to match. Values set explicitly in the config are used
/// as-is.
///
/// Size limits and request cost scale independently: the size limits shape chunks, while the
/// request cost trades request count against duplicated bytes.
#[derive(Clone, Copy, Debug)]
pub struct ChunkSizeDefaults {
    size_percent: usize,
    request_cost_percent: u64,
}

impl ChunkSizeDefaults {
    pub fn new(minify: bool, minify_before_chunking: bool) -> Self {
        if minify && minify_before_chunking {
            ChunkSizeDefaults {
                size_percent: MINIFIED_SIZE_PERCENT,
                request_cost_percent: MINIFIED_REQUEST_COST_PERCENT,
            }
        } else {
            ChunkSizeDefaults {
                size_percent: 100,
                request_cost_percent: 100,
            }
        }
    }

    /// Scales a default size limit, given in unminified bytes.
    pub fn size(self, unminified: usize) -> usize {
        unminified * self.size_percent / 100
    }

    /// Scales a default request cost, given in unminified bytes.
    pub fn request_cost(self, unminified: u64) -> u64 {
        unminified * self.request_cost_percent / 100
    }

    /// The request cost to use when the config sets none: `None` keeps the chunker's own default,
    /// unless it needs scaling.
    pub fn default_request_cost(self) -> Option<u64> {
        (self.request_cost_percent != 100)
            .then(|| self.request_cost(DEFAULT_ESTIMATED_REQUEST_COST_BYTES))
    }
}
