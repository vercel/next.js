use std::{
    fmt::{Debug, Display, Formatter},
    iter::Sum,
    ops::{Add, AddAssign, Deref, Div, DivAssign, Mul, MulAssign, Sub, SubAssign},
};

use serde::{Deserialize, Serialize};

const DUR_VALUE_MICROSECOND: u64 = 100;

#[derive(Clone, Copy, Default, Serialize, Deserialize)]
pub struct Timestamp(u64);

impl Timestamp {
    pub const MAX: Self = Self(u64::MAX);
    pub const ZERO: Self = Self(0);
}

impl Timestamp {
    pub fn from_micros(micros: u64) -> Self {
        Self(micros * DUR_VALUE_MICROSECOND)
    }

    pub fn is_zero(&self) -> bool {
        self.0 == 0
    }

    pub fn from_value(value: u64) -> Self {
        Self(value)
    }

    pub fn saturating_sub(self, rhs: Self) -> Self {
        Self(self.0.saturating_sub(rhs.0))
    }
}

impl Debug for Timestamp {
    fn fmt(&self, f: &mut Formatter) -> std::fmt::Result {
        write!(f, "{:.2}μs", self.0 as f64 / DUR_VALUE_MICROSECOND as f64)
    }
}

impl Display for Timestamp {
    fn fmt(&self, f: &mut Formatter) -> std::fmt::Result {
        write!(f, "{:.2}μs", self.0 as f64 / DUR_VALUE_MICROSECOND as f64)
    }
}

impl Add for Timestamp {
    type Output = Self;

    fn add(self, rhs: Self) -> Self {
        Self(self.0 + rhs.0)
    }
}

impl AddAssign for Timestamp {
    fn add_assign(&mut self, rhs: Self) {
        self.0 += rhs.0;
    }
}

impl Sub for Timestamp {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self {
        Self(self.0 - rhs.0)
    }
}

impl SubAssign for Timestamp {
    fn sub_assign(&mut self, rhs: Self) {
        self.0 -= rhs.0;
    }
}

impl Div<u64> for Timestamp {
    type Output = Self;

    fn div(self, rhs: u64) -> Self {
        Self(self.0 / rhs)
    }
}

impl DivAssign<u64> for Timestamp {
    fn div_assign(&mut self, rhs: u64) {
        self.0 /= rhs;
    }
}

impl Div for Timestamp {
    type Output = u64;

    fn div(self, rhs: Self) -> u64 {
        self.0 / rhs.0
    }
}

impl Mul<u64> for Timestamp {
    type Output = Self;

    fn mul(self, rhs: u64) -> Self {
        Self(self.0 * rhs)
    }
}

impl MulAssign<u64> for Timestamp {
    fn mul_assign(&mut self, rhs: u64) {
        self.0 *= rhs;
    }
}

impl Sum for Timestamp {
    fn sum<I: Iterator<Item = Self>>(iter: I) -> Self {
        iter.fold(Timestamp(0), |a, b| a + b)
    }
}

impl PartialEq for Timestamp {
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}

impl Eq for Timestamp {}

impl Ord for Timestamp {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.0.cmp(&other.0)
    }
}

impl PartialOrd for Timestamp {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Deref for Timestamp {
    type Target = u64;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
