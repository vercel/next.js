use turbo_persistence::{Compression, FamilyConfig, FamilyKind, shard::ShardBits};

#[derive(Debug, Clone, Copy)]
pub enum KeySpace {
    Infra = 0,
    TaskMeta = 1,
    TaskData = 2,
    TaskCache = 3,
    StateData = 4,
    StateIndex = 5,
}
impl KeySpace {
    /// Constructs a [`KeySpace`] from its numeric index (i.e., the `usize` discriminant).
    ///
    /// # Panics
    ///
    /// Panics if `i` is out of range (i.e., `>= FAMILIES`).
    pub const fn from_index(i: usize) -> Self {
        match i {
            0 => KeySpace::Infra,
            1 => KeySpace::TaskMeta,
            2 => KeySpace::TaskData,
            3 => KeySpace::TaskCache,
            4 => KeySpace::StateData,
            5 => KeySpace::StateIndex,
            _ => panic!("KeySpace index out of range"),
        }
    }

    const fn name(&self) -> &'static str {
        match self {
            KeySpace::Infra => "Infra",
            KeySpace::TaskMeta => "TaskMeta",
            KeySpace::TaskData => "TaskData",
            KeySpace::TaskCache => "TaskCache",
            KeySpace::StateData => "StateData",
            KeySpace::StateIndex => "StateIndex",
        }
    }

    /// Returns the persistence configuration for this keyspace.
    pub const fn family_config(&self) -> FamilyConfig {
        match self {
            KeySpace::Infra | KeySpace::TaskMeta => FamilyConfig {
                name: self.name(),
                kind: FamilyKind::SingleValue,
                compression: Compression::Lz4,
                initial_shard_bits: ShardBits::new(match self {
                    KeySpace::Infra => 0,
                    _ => 2,
                }),
            },
            KeySpace::TaskData | KeySpace::StateData => FamilyConfig {
                name: self.name(),
                kind: FamilyKind::SingleValue,
                compression: Compression::Zstd3,
                initial_shard_bits: ShardBits::new(3),
            },
            KeySpace::TaskCache | KeySpace::StateIndex => FamilyConfig {
                name: self.name(),
                // Hash candidates and live-state IDs are individual mappings,
                // with incremental insertion/deletion instead of whole buckets.
                kind: FamilyKind::MultiValue,
                compression: Compression::Lz4,
                initial_shard_bits: ShardBits::new(0),
            },
        }
    }
}
