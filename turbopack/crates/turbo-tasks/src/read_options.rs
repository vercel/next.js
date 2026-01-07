use crate::{ReadConsistency, ReadTracking};

#[derive(Clone, Copy, Debug, Default)]
pub struct ReadCellOptions {
    pub tracking: ReadTracking,
    pub is_serializable_cell_content: bool,
    pub final_read_hint: bool,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct ReadOutputOptions {
    pub tracking: ReadTracking,
    pub consistency: ReadConsistency,
}
