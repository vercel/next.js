use crate::{ReadConsistency, ReadTracking, manager::ReadCellTracking};

#[derive(Clone, Copy, Debug, Default)]
pub struct ReadCellOptions {
    pub tracking: ReadCellTracking,
    pub final_read_hint: bool,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct ReadOutputOptions {
    pub tracking: ReadTracking,
    pub consistency: ReadConsistency,
}
