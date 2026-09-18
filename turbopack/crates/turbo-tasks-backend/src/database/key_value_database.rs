use turbo_persistence::{Compression, FamilyConfig, FamilyKind};

#[derive(Debug, Clone, Copy)]
pub enum KeySpace {
    Infra = 0,
    TaskMeta = 1,
    TaskData = 2,
    TaskCache = 3,
    FileSystemPath = 4,
    TaskMetaPathRefs = 5,
    TaskDataPathRefs = 6,
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
            4 => KeySpace::FileSystemPath,
            5 => KeySpace::TaskMetaPathRefs,
            6 => KeySpace::TaskDataPathRefs,
            _ => panic!("KeySpace index out of range"),
        }
    }

    const fn name(&self) -> &'static str {
        match self {
            KeySpace::Infra => "Infra",
            KeySpace::TaskMeta => "TaskMeta",
            KeySpace::TaskData => "TaskData",
            KeySpace::TaskCache => "TaskCache",
            KeySpace::FileSystemPath => "FileSystemPath",
            KeySpace::TaskMetaPathRefs => "TaskMetaPathRefs",
            KeySpace::TaskDataPathRefs => "TaskDataPathRefs",
        }
    }

    /// Returns the persistence configuration for this keyspace.
    pub const fn family_config(&self) -> FamilyConfig {
        match self {
            KeySpace::Infra | KeySpace::TaskMeta => FamilyConfig {
                name: self.name(),
                kind: FamilyKind::SingleValue,
                compression: Compression::Lz4,
            },
            KeySpace::TaskData => FamilyConfig {
                name: self.name(),
                kind: FamilyKind::SingleValue,
                compression: Compression::Zstd3,
            },
            KeySpace::TaskCache => FamilyConfig {
                name: self.name(),
                // TaskCache uses hash-based lookups with potential collisions.
                kind: FamilyKind::MultiValue,
                compression: Compression::Lz4,
            },
            KeySpace::FileSystemPath | KeySpace::TaskMetaPathRefs | KeySpace::TaskDataPathRefs => {
                FamilyConfig {
                    name: self.name(),
                    kind: FamilyKind::SingleValue,
                    compression: Compression::Lz4,
                }
            }
        }
    }
}
