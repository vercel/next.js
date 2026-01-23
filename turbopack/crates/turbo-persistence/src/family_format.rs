//! Family format configuration for per-family storage optimization.
//!
//! This module provides traits and types for configuring how different key-value
//! families are stored in the database. The key insight is that different families
//! have different characteristics that can be exploited for optimization:
//!
//! - **Direct keys**: Integer keys (like TaskId) can be stored without hashing
//! - **Fixed values**: Known-size values can be stored inline without offset tables
//! - **Skip compression**: High-entropy data (like hashes) doesn't compress well
//!
//! ## Key Rotation for Sharding
//!
//! TaskId uses the upper 2 bits for sharding purposes. When storing keys directly
//! (sorted by byte order), we need to rotate the key so that the sharding bits
//! don't dominate the sort order. We rotate right by 2 bits, moving the sharding
//! bits to the low end.
//!
//! This allows entries with the same "logical" key to be grouped together while
//! still maintaining efficient binary search.

/// Describes the storage format for a key-value family.
///
/// Implement this trait to define custom storage characteristics for a family.
pub trait FamilyFormat: 'static + Send + Sync {
    /// Key size if fixed (enables direct key storage without hashing).
    /// `None` = variable-size keys (requires hashing).
    const KEY_SIZE: Option<usize> = None;

    /// Value size if fixed (enables inline storage).
    /// `None` = variable-size values (stored in separate blocks).
    const VALUE_SIZE: Option<usize> = None;

    /// Whether to skip compression (for high-entropy data).
    const SKIP_COMPRESSION: bool = false;

    /// Helper: does this format use direct keys?
    fn uses_direct_keys() -> bool {
        Self::KEY_SIZE.is_some()
    }

    /// Helper: does this format use fixed-size entries?
    fn uses_fixed_layout() -> bool {
        Self::KEY_SIZE.is_some() && Self::VALUE_SIZE.is_some()
    }
}

/// Runtime-inspectable format configuration.
///
/// This struct provides runtime access to format properties for storage decisions.
#[derive(Clone, Copy, Debug, Default)]
pub struct FormatConfig {
    /// Key size if fixed.
    pub key_size: Option<usize>,
    /// Value size if fixed.
    pub value_size: Option<usize>,
    /// Whether to skip compression.
    pub skip_compression: bool,
}

impl FormatConfig {
    /// Creates a FormatConfig from a FamilyFormat type.
    pub fn from_format<F: FamilyFormat>() -> Self {
        Self {
            key_size: F::KEY_SIZE,
            value_size: F::VALUE_SIZE,
            skip_compression: F::SKIP_COMPRESSION,
        }
    }

    /// Returns true if this format uses direct keys.
    pub fn uses_direct_keys(&self) -> bool {
        self.key_size.is_some()
    }

    /// Returns true if this format uses fixed-size entries.
    pub fn uses_fixed_layout(&self) -> bool {
        self.key_size.is_some() && self.value_size.is_some()
    }
}

/// Marker trait for a tuple of FamilyFormat types.
///
/// This trait allows specifying per-family formats at the type level.
pub trait FamilyFormats: 'static + Send + Sync {
    /// Number of families.
    const COUNT: usize;

    /// Get the runtime config for a specific family.
    fn config(family: usize) -> FormatConfig;
}

// === Concrete Format Types ===

/// Default format: variable keys (hashed), variable values, compressed.
///
/// Use this for families with variable-size keys or where hashing is desired.
pub struct DefaultFormat;

impl FamilyFormat for DefaultFormat {}

/// Direct key with variable values: fixed-size integer keys, variable values, compressed.
///
/// Use this for families with fixed-size integer keys (like TaskId) but variable-size values.
/// Saves 8 bytes per entry by storing keys directly instead of with a hash prefix.
pub struct DirectKeyVariableValue<const KEY_SIZE: usize>;

impl<const K: usize> FamilyFormat for DirectKeyVariableValue<K> {
    const KEY_SIZE: Option<usize> = Some(K);
}

/// Direct key with fixed values: fixed-size keys + values, no compression.
///
/// Use this for families with fixed-size integer keys and fixed-size values.
/// The most optimized format - stores entries inline without offset tables or compression.
pub struct DirectKeyFixedValue<const KEY_SIZE: usize, const VALUE_SIZE: usize>;

impl<const K: usize, const V: usize> FamilyFormat for DirectKeyFixedValue<K, V> {
    const KEY_SIZE: Option<usize> = Some(K);
    const VALUE_SIZE: Option<usize> = Some(V);
    const SKIP_COMPRESSION: bool = true;
}

// === Convenience Aliases ===

/// TaskId-keyed with variable values (for TaskMeta, TaskData).
pub type TaskIdKeyedFormat = DirectKeyVariableValue<4>;

/// TaskId-keyed with u64 hash value (for TaskIdToTaskTypeHash).
pub type TaskIdToHashFormat = DirectKeyFixedValue<4, 8>;

// === FamilyFormats implementations for tuples ===

macro_rules! impl_family_formats {
    ($count:expr, $($idx:tt: $ty:ident),+) => {
        impl<$($ty: FamilyFormat),+> FamilyFormats for ($($ty,)+) {
            const COUNT: usize = $count;

            fn config(family: usize) -> FormatConfig {
                match family {
                    $($idx => FormatConfig::from_format::<$ty>(),)+
                    _ => panic!("Invalid family index: {}", family),
                }
            }
        }
    };
}

impl_family_formats!(1, 0: F0);
impl_family_formats!(2, 0: F0, 1: F1);
impl_family_formats!(3, 0: F0, 1: F1, 2: F2);
impl_family_formats!(4, 0: F0, 1: F1, 2: F2, 3: F3);
impl_family_formats!(5, 0: F0, 1: F1, 2: F2, 3: F3, 4: F4);
impl_family_formats!(6, 0: F0, 1: F1, 2: F2, 3: F3, 4: F4, 5: F5);
impl_family_formats!(7, 0: F0, 1: F1, 2: F2, 3: F3, 4: F4, 5: F5, 6: F6);
impl_family_formats!(8, 0: F0, 1: F1, 2: F2, 3: F3, 4: F4, 5: F5, 6: F6, 7: F7);

// =============================================================================
// Key Conversion Utilities for u32 Direct Keys
// =============================================================================

/// Rotates a u32 key right by 2 bits for proper sorting.
///
/// TaskId uses the upper 2 bits for sharding. By rotating right, we move
/// the sharding bits to the low end so they don't dominate the sort order.
/// This ensures entries are grouped by their logical key value.
#[inline]
pub fn rotate_key(key: u32) -> u32 {
    key.rotate_right(2)
}

/// Unrotates a u32 key (inverse of rotate_key).
#[inline]
pub fn unrotate_key(rotated: u32) -> u32 {
    rotated.rotate_left(2)
}

/// Converts a rotated u32 key to a u64 for range comparisons.
///
/// The rotated key is placed in the high 32 bits so that u64 comparisons
/// maintain the same ordering as u32 comparisons on the rotated keys.
#[inline]
pub fn rotated_key_to_u64(rotated_key: u32) -> u64 {
    (rotated_key as u64) << 32
}

/// Converts a u32 key to a rotated u64 for range comparisons.
///
/// Combines rotation and conversion in one step.
#[inline]
pub fn key_to_range_value(key: u32) -> u64 {
    rotated_key_to_u64(rotate_key(key))
}
