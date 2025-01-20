use core::fmt;
use std::fmt::{Debug, Formatter};

#[derive(Copy, Clone)]
pub struct Histogram {
    buckets: [usize; 64],
}

impl Default for Histogram {
    fn default() -> Self {
        Self::new()
    }
}

impl Histogram {
    pub fn new() -> Self {
        Self { buckets: [0; 64] }
    }

    pub fn add(&mut self, value: usize) {
        let bucket = if value == 0 { 0 } else { value.ilog2() + 1 };
        self.buckets[bucket as usize] += 1;
    }

    pub fn add_zero_by_total(&mut self, total: usize) {
        let zero = total.saturating_sub(self.buckets.iter().sum::<usize>());
        self.buckets[0] += zero;
    }
}

impl Debug for Histogram {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        for (i, &count) in self.buckets.iter().enumerate() {
            if count == 0 {
                continue;
            }
            if i == 0 {
                writeln!(f, "0: {}", count)?;
                continue;
            }
            writeln!(f, "{:2} - {:2}: {}", 1 << (i - 1), (1 << i) - 1, count)?;
        }
        Ok(())
    }
}
