use std::hash::Hasher;

pub use turbo_tasks_macros::DeterministicHash;

/// DeterministicHash is a custom trait that signals the implementor can safely
/// be hashed in a replicatable way across platforms and process runs. Note that
/// the default Hash trait used by Rust is not deterministic for our purposes.
///
/// It's very important that Vcs never implement this, since they cannot be
/// deterministic. The value that they wrap, however, can implement the trait.
pub trait DeterministicHash {
    /// Adds self's bytes to the [Hasher] state, in a way that is replicatable
    /// on any platform or process run.
    fn deterministic_hash<H: Hasher>(&self, state: &mut H);
}

impl DeterministicHash for String {
    fn deterministic_hash<H: Hasher>(&self, state: &mut H) {
        state.write(self.as_bytes());
    }
}

impl DeterministicHash for u32 {
    fn deterministic_hash<H: Hasher>(&self, state: &mut H) {
        // Apple silicon and Intel chips both use little endian, so this should be fast.
        let little_endian = self.to_le_bytes();
        state.write(&little_endian);
    }
}

impl DeterministicHash for u64 {
    fn deterministic_hash<H: Hasher>(&self, state: &mut H) {
        // Apple silicon and Intel chips both use little endian, so this should be fast.
        let little_endian = self.to_le_bytes();
        state.write(&little_endian);
    }
}
