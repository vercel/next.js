use crate::constants::{MAX_VALUE_BLOCK_COUNT, MIN_SMALL_VALUE_BLOCK_SIZE};

/// Tracks the number of value blocks that will be created for a set of entries.
/// Used to prevent exceeding the u16 block index limit in SST files.
#[derive(Default)]
pub struct ValueBlockCountTracker {
    value_block_count: usize,
    current_small_value_block_size: usize,
}

impl ValueBlockCountTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Track a new entry's value. Call with `is_medium=true` for medium values
    /// (1 dedicated block each), or `small_value_size > 0` for small block values.
    pub fn track(&mut self, is_medium: bool, small_value_size: usize) {
        if is_medium {
            self.value_block_count += 1;
        } else if small_value_size > 0 {
            self.current_small_value_block_size += small_value_size;
            if self.current_small_value_block_size >= MIN_SMALL_VALUE_BLOCK_SIZE {
                self.value_block_count += 1;
                self.current_small_value_block_size = 0;
            }
        }
    }

    /// Returns true if the tracked value block count has reached the maximum.
    pub fn is_full(&self) -> bool {
        self.value_block_count + (self.current_small_value_block_size > 0) as usize
            >= MAX_VALUE_BLOCK_COUNT
    }

    /// Returns true if the tracked value block count has reached half of the maximum.
    pub fn is_half_full(&self) -> bool {
        self.value_block_count + (self.current_small_value_block_size > 0) as usize
            >= MAX_VALUE_BLOCK_COUNT / 2
    }

    /// Reset the tracker to empty.
    pub fn reset(&mut self) {
        self.value_block_count = 0;
        self.current_small_value_block_size = 0;
    }

    /// Reset the tracker to contain only the given entry.
    pub fn reset_to(&mut self, is_medium: bool, small_value_size: usize) {
        self.value_block_count = if is_medium { 1 } else { 0 };
        self.current_small_value_block_size = small_value_size;
    }
}
