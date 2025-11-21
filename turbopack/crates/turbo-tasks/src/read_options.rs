use crate::{ReadConsistency, ReadTracking};

#[derive(Clone, Copy, Debug, Default)]
pub struct ReadCellOptions {
    pub tracking: ReadTracking,
    pub final_read_hint: bool,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct ReadOutputOptions {
    pub tracking: ReadTracking,
    pub consistency: ReadConsistency,
}
