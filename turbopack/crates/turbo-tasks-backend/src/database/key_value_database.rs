use turbo_persistence::{FamilyConfig, FamilyKind};

#[derive(Debug, Clone, Copy)]
pub enum KeySpace {
    Infra = 0,
    TaskMeta = 1,
    TaskData = 2,
    TaskCache = 3,
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
            _ => panic!("KeySpace index out of range"),
        }
    }

    const fn name(&self) -> &'static str {
        match self {
            KeySpace::Infra => "Infra",
            KeySpace::TaskMeta => "TaskMeta",
            KeySpace::TaskData => "TaskData",
            KeySpace::TaskCache => "TaskCache",
        }
    }

    /// Returns the persistence configuration for this keyspace.
    pub const fn family_config(&self) -> FamilyConfig {
        match self {
            KeySpace::Infra | KeySpace::TaskMeta | KeySpace::TaskData => FamilyConfig {
                name: self.name(),
                kind: FamilyKind::SingleValue,
            },
            KeySpace::TaskCache => FamilyConfig {
                name: self.name(),
                // TaskCache uses hash-based lookups with potential collisions.
                kind: FamilyKind::MultiValue,
            },
        }
    }
}
