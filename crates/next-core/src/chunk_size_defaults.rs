use turbopack_core::chunk::chunking::DEFAULT_ESTIMATED_REQUEST_COST_BYTES;

/// Scale of the default chunk size limits and request cost when chunk items are minified before
/// chunking, in percent of the unminified defaults.
const MINIFIED_PERCENT: u64 = 40;

/// Defaults for the production chunking size limits and request cost.
///
/// The defaults are tuned for chunk items measured by their unminified code. When chunk items are
/// minified one by one before chunking (`turbopackMinifyBeforeChunking`, which only applies when
/// minification is enabled), chunking measures their minified code instead, which is a few times
/// smaller, so the defaults are scaled down to match. Values set explicitly in the config are used
/// as-is.
#[derive(Clone, Copy, Debug)]
pub struct ChunkSizeDefaults {
    percent: u64,
}

impl ChunkSizeDefaults {
    pub fn new(minify: bool, minify_before_chunking: bool) -> Self {
        ChunkSizeDefaults {
            percent: if minify && minify_before_chunking {
                MINIFIED_PERCENT
            } else {
                100
            },
        }
    }

    /// Scales a default size limit, given in unminified bytes.
    pub fn size(self, unminified: usize) -> usize {
        unminified * self.percent as usize / 100
    }

    /// Resolves the best-effort client JS maximum, scaling only the default (1 MB).
    pub fn client_max_chunk_size(self, value: Option<usize>) -> usize {
        value.unwrap_or_else(|| self.size(1_000_000))
    }

    /// Resolves the best-effort Node.js server and edge JS maximum, scaling only the default (10
    /// MB).
    pub fn server_max_chunk_size(self, value: Option<usize>) -> usize {
        value.unwrap_or_else(|| self.size(10_000_000))
    }

    /// Scales a default request cost, given in unminified bytes.
    pub fn request_cost(self, unminified: u64) -> u64 {
        unminified * self.percent / 100
    }

    /// The request cost to use when the config sets none: `None` keeps the chunker's own default,
    /// unless it needs scaling.
    pub fn default_request_cost(self) -> Option<u64> {
        (self.percent != 100).then(|| self.request_cost(DEFAULT_ESTIMATED_REQUEST_COST_BYTES))
    }
}

#[cfg(test)]
mod tests {
    use turbopack_core::chunk::ChunkingConfig;

    use crate::chunk_size_defaults::ChunkSizeDefaults;

    #[test]
    fn maximum_defaults_follow_the_sizing_mode_but_overrides_do_not() {
        for (minify, before_chunking, client, server) in [
            (false, false, 1_000_000, 10_000_000),
            (false, true, 1_000_000, 10_000_000),
            (true, false, 1_000_000, 10_000_000),
            (true, true, 400_000, 4_000_000),
        ] {
            let defaults = ChunkSizeDefaults::new(minify, before_chunking);
            assert_eq!(defaults.client_max_chunk_size(None), client);
            assert_eq!(defaults.server_max_chunk_size(None), server);
            for value in [0, 50_000, 1_000_000, 10_000_000] {
                assert_eq!(defaults.client_max_chunk_size(Some(value)), value);
                assert_eq!(defaults.server_max_chunk_size(Some(value)), value);
            }
        }
    }

    #[test]
    fn normalization_uses_the_scaled_minimum_and_resolved_maximum() {
        let defaults = ChunkSizeDefaults::new(true, true);
        let client = ChunkingConfig {
            min_chunk_size: defaults.size(50_000),
            max_merge_chunk_size: defaults.size(200_000),
            max_chunk_size: defaults.client_max_chunk_size(Some(50_000)),
            ..Default::default()
        }
        .normalized();
        assert_eq!(client.min_chunk_size, 20_000);
        assert_eq!(client.max_chunk_size, 60_000);
        assert_eq!(client.max_merge_chunk_size, 60_000);

        let server = ChunkingConfig {
            min_chunk_size: defaults.size(4_000),
            max_merge_chunk_size: defaults.size(100_000),
            max_chunk_size: defaults.server_max_chunk_size(None),
            ..Default::default()
        }
        .normalized();
        assert_eq!(server.min_chunk_size, 1_600);
        assert_eq!(server.max_merge_chunk_size, 40_000);
        assert_eq!(server.max_chunk_size, 4_000_000);

        let edge = ChunkingConfig {
            min_chunk_size: defaults.size(20_000),
            max_chunk_size: defaults.server_max_chunk_size(Some(10_000)),
            ..Default::default()
        }
        .normalized();
        assert_eq!(edge.max_chunk_size, 24_000);
        assert_eq!(edge.max_merge_chunk_size, 24_000);

        let disabled = ChunkingConfig {
            max_chunk_size: defaults.client_max_chunk_size(Some(0)),
            ..client
        }
        .normalized();
        assert_eq!(disabled.max_chunk_size, 0);
    }
}
