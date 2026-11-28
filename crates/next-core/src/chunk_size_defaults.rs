//! Default production chunking size limits and request costs.
//!
//! The base values below are in bytes of uncompressed **minified** code, which is what chunking
//! measures by default (`turbopackMinifyBeforeChunking`). When chunk items are measured by their
//! unminified code instead, the defaults are multiplied by 2.5, see [`ChunkSizeDefaults`].

/// Default client `minChunkSize`.
pub const CLIENT_MIN_CHUNK_SIZE: usize = 20_000;
/// Default client `maxMergeChunkSize`.
pub const CLIENT_MAX_MERGE_CHUNK_SIZE: usize = 80_000;
/// Default client `maxChunkSize`.
pub const CLIENT_MAX_CHUNK_SIZE: usize = 400_000;
/// Default client `minComponentChunkSize`.
pub const CLIENT_MIN_COMPONENT_CHUNK_SIZE: usize = 8_000;
/// Default client and edge `requestCost`.
pub const CLIENT_REQUEST_COST: u64 = 80_000;
/// Default `minServerChunkSize` (Node.js).
pub const SERVER_MIN_CHUNK_SIZE: usize = 1_600;
/// Default `maxMergeServerChunkSize` (Node.js).
pub const SERVER_MAX_MERGE_CHUNK_SIZE: usize = 40_000;
/// Default `maxServerChunkSize` (Node.js and edge).
pub const SERVER_MAX_CHUNK_SIZE: usize = 4_000_000;
/// Request cost for Node.js server chunks (not configurable).
pub const SERVER_REQUEST_COST: u64 = 4_000;
/// Minimum chunk size for edge chunks (not configurable).
pub const EDGE_MIN_CHUNK_SIZE: usize = 8_000;

/// Defaults for the production chunking size limits and request cost.
///
/// The base defaults are tuned for chunk items measured by their minified code, which is the
/// default: each chunk item is minified before chunking (`turbopackMinifyBeforeChunking`). When
/// that doesn't apply (the option is disabled, or minification is off), chunking measures
/// unminified code, which is a few times bigger, so the defaults are multiplied by 2.5. Values set
/// explicitly in the config are used as-is.
#[derive(Clone, Copy, Debug)]
pub struct ChunkSizeDefaults {
    /// Whether chunk items are measured by their unminified code.
    unminified: bool,
}

impl ChunkSizeDefaults {
    pub fn new(minify: bool, minify_before_chunking: bool) -> Self {
        ChunkSizeDefaults {
            unminified: !(minify && minify_before_chunking),
        }
    }

    /// Scales a default size limit, given in minified bytes.
    pub fn size(self, minified: usize) -> usize {
        if self.unminified {
            minified * 5 / 2
        } else {
            minified
        }
    }

    /// Resolves the best-effort client JS maximum, scaling only the default.
    pub fn client_max_chunk_size(self, value: Option<usize>) -> usize {
        value.unwrap_or_else(|| self.size(CLIENT_MAX_CHUNK_SIZE))
    }

    /// Resolves the best-effort Node.js server and edge JS maximum, scaling only the default.
    pub fn server_max_chunk_size(self, value: Option<usize>) -> usize {
        value.unwrap_or_else(|| self.size(SERVER_MAX_CHUNK_SIZE))
    }

    /// Scales a default request cost, given in minified bytes.
    pub fn request_cost(self, minified: u64) -> u64 {
        if self.unminified {
            minified * 5 / 2
        } else {
            minified
        }
    }

    /// The client and edge request cost to use when the config sets none.
    pub fn default_request_cost(self) -> u64 {
        self.request_cost(CLIENT_REQUEST_COST)
    }
}

#[cfg(test)]
mod tests {
    use turbopack_core::chunk::{ChunkingConfig, chunking::DEFAULT_ESTIMATED_REQUEST_COST_BYTES};

    use crate::chunk_size_defaults::*;

    /// The resolved defaults (client min, merge, max, component min, request cost; server min,
    /// merge, max, request cost; edge min, request cost, max) are the same as before the base
    /// values were flipped from unminified to minified sizes.
    #[test]
    fn resolved_defaults_are_unchanged_for_every_sizing_mode() {
        const MINIFIED: [u64; 12] = [
            20_000, 80_000, 400_000, 8_000, 80_000, 1_600, 40_000, 4_000_000, 4_000, 8_000, 80_000,
            4_000_000,
        ];
        const UNMINIFIED: [u64; 12] = [
            50_000, 200_000, 1_000_000, 20_000, 200_000, 4_000, 100_000, 10_000_000, 10_000,
            20_000, 200_000, 10_000_000,
        ];
        for (minify, before_chunking, expected) in [
            (false, false, UNMINIFIED),
            (false, true, UNMINIFIED),
            (true, false, UNMINIFIED),
            (true, true, MINIFIED),
        ] {
            let defaults = ChunkSizeDefaults::new(minify, before_chunking);
            let resolved = [
                defaults.size(CLIENT_MIN_CHUNK_SIZE) as u64,
                defaults.size(CLIENT_MAX_MERGE_CHUNK_SIZE) as u64,
                defaults.client_max_chunk_size(None) as u64,
                defaults.size(CLIENT_MIN_COMPONENT_CHUNK_SIZE) as u64,
                defaults.default_request_cost(),
                defaults.size(SERVER_MIN_CHUNK_SIZE) as u64,
                defaults.size(SERVER_MAX_MERGE_CHUNK_SIZE) as u64,
                defaults.server_max_chunk_size(None) as u64,
                defaults.request_cost(SERVER_REQUEST_COST),
                defaults.size(EDGE_MIN_CHUNK_SIZE) as u64,
                defaults.default_request_cost(),
                defaults.server_max_chunk_size(None) as u64,
            ];
            assert_eq!(
                resolved, expected,
                "minify={minify}, before={before_chunking}"
            );
        }
        // Without minification before chunking, the client and edge request cost is the chunker's
        // own default.
        assert_eq!(
            ChunkSizeDefaults::new(false, false).default_request_cost(),
            DEFAULT_ESTIMATED_REQUEST_COST_BYTES
        );
    }

    #[test]
    fn explicit_maximums_are_not_scaled() {
        for (minify, before_chunking) in
            [(false, false), (false, true), (true, false), (true, true)]
        {
            let defaults = ChunkSizeDefaults::new(minify, before_chunking);
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
            min_chunk_size: defaults.size(CLIENT_MIN_CHUNK_SIZE),
            max_merge_chunk_size: defaults.size(CLIENT_MAX_MERGE_CHUNK_SIZE),
            max_chunk_size: defaults.client_max_chunk_size(Some(50_000)),
            ..Default::default()
        }
        .normalized();
        assert_eq!(client.min_chunk_size, 20_000);
        assert_eq!(client.max_chunk_size, 60_000);
        assert_eq!(client.max_merge_chunk_size, 60_000);

        let server = ChunkingConfig {
            min_chunk_size: defaults.size(SERVER_MIN_CHUNK_SIZE),
            max_merge_chunk_size: defaults.size(SERVER_MAX_MERGE_CHUNK_SIZE),
            max_chunk_size: defaults.server_max_chunk_size(None),
            ..Default::default()
        }
        .normalized();
        assert_eq!(server.min_chunk_size, 1_600);
        assert_eq!(server.max_merge_chunk_size, 40_000);
        assert_eq!(server.max_chunk_size, 4_000_000);

        let edge = ChunkingConfig {
            min_chunk_size: defaults.size(EDGE_MIN_CHUNK_SIZE),
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
