use super::frame_info::{BlockChecksum, BlockMode, BlockSize, ContentChecksum, FrameInfo};
use std::os::raw::{c_int, c_uint};

/// Predefined compression level (0).
pub const CLEVEL_DEFAULT: i32 = 0;

/// Predefined compression level (10).
pub const CLEVEL_HIGH: i32 = 10;

/// Predefined compression level (12).
pub const CLEVEL_MAX: i32 = 12;

/// Auto flush mode flag.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[repr(C)]
pub enum AutoFlush {
    Disabled,
    Enabled,
}

impl Default for AutoFlush {
    fn default() -> Self {
        Self::Disabled
    }
}

/// Decompression speed mode flag.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[repr(C)]
pub enum FavorDecSpeed {
    Disabled,
    Enabled,
}

impl Default for FavorDecSpeed {
    fn default() -> Self {
        Self::Disabled
    }
}

/// Compression preferences.
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Hash)]
#[repr(C)]
pub struct Preferences {
    frame_info: FrameInfo,
    compression_level: c_int,
    auto_flush: AutoFlush,
    favor_dec_speed: FavorDecSpeed,
    _reserved: [c_uint; 3],
}

impl Preferences {
    /// Returns the frame info.
    pub const fn frame_info(&self) -> FrameInfo {
        self.frame_info
    }

    /// Returns the compression level.
    pub const fn compression_level(&self) -> i32 {
        self.compression_level
    }

    /// Returns the auto flush mode flag.
    pub const fn auto_flush(&self) -> AutoFlush {
        self.auto_flush
    }

    /// Returns the decompression speed mode flag.
    pub const fn favor_dec_speed(&self) -> FavorDecSpeed {
        self.favor_dec_speed
    }

    pub(super) fn set_block_size(&mut self, block_size: BlockSize) {
        self.frame_info.set_block_size(block_size);
    }

    pub(super) fn set_block_mode(&mut self, block_mode: BlockMode) {
        self.frame_info.set_block_mode(block_mode);
    }

    pub(super) fn set_content_checksum(&mut self, checksum: ContentChecksum) {
        self.frame_info.set_content_checksum(checksum);
    }

    pub(super) fn set_content_size(&mut self, size: usize) {
        self.frame_info.set_content_size(size);
    }

    pub(super) fn set_dict_id(&mut self, dict_id: u32) {
        self.frame_info.set_dict_id(dict_id);
    }

    pub(super) fn set_block_checksum(&mut self, checksum: BlockChecksum) {
        self.frame_info.set_block_checksum(checksum);
    }

    pub(super) fn set_compression_level(&mut self, level: i32) {
        self.compression_level = level as c_int;
    }

    pub(super) fn set_favor_dec_speed(&mut self, dec_speed: FavorDecSpeed) {
        self.favor_dec_speed = dec_speed;
    }

    pub(super) fn set_auto_flush(&mut self, auto_flush: AutoFlush) {
        self.auto_flush = auto_flush;
    }
}

/// Builds a custom `Preferences`.
///
/// # Example
///
/// ```
/// use lzzzz::lz4f::{BlockSize, PreferencesBuilder, CLEVEL_MAX};
///
/// let pref = PreferencesBuilder::new()
///     .block_size(BlockSize::Max1MB)
///     .compression_level(CLEVEL_MAX)
///     .build();
/// ```
#[derive(Default, Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct PreferencesBuilder {
    prefs: Preferences,
}

impl PreferencesBuilder {
    /// Creates a new `PreferencesBuilder`.
    pub fn new() -> Self {
        Default::default()
    }

    /// Sets the block size.
    pub fn block_size(&mut self, block_size: BlockSize) -> &mut Self {
        self.prefs.set_block_size(block_size);
        self
    }

    /// Sets the block mode.
    pub fn block_mode(&mut self, block_mode: BlockMode) -> &mut Self {
        self.prefs.set_block_mode(block_mode);
        self
    }

    /// Sets the content checksum.
    pub fn content_checksum(&mut self, checksum: ContentChecksum) -> &mut Self {
        self.prefs.set_content_checksum(checksum);
        self
    }

    /// Sets the content size.
    ///
    /// A value greater than 0 enables the content size field in the frame header and
    /// automatically replaced with an actual content size.
    pub fn content_size(&mut self, size: usize) -> &mut Self {
        self.prefs.set_content_size(size);
        self
    }

    /// Sets the dictionary id.
    pub fn dict_id(&mut self, dict_id: u32) -> &mut Self {
        self.prefs.set_dict_id(dict_id);
        self
    }

    /// Sets the block checksum.
    pub fn block_checksum(&mut self, checksum: BlockChecksum) -> &mut Self {
        self.prefs.set_block_checksum(checksum);
        self
    }

    /// Sets the compression level.
    pub fn compression_level(&mut self, level: i32) -> &mut Self {
        self.prefs.set_compression_level(level);
        self
    }

    /// Sets the decompression speed mode flag.
    pub fn favor_dec_speed(&mut self, dec_speed: FavorDecSpeed) -> &mut Self {
        self.prefs.set_favor_dec_speed(dec_speed);
        self
    }

    /// Sets the auto flush mode flag.
    pub fn auto_flush(&mut self, auto_flush: AutoFlush) -> &mut Self {
        self.prefs.set_auto_flush(auto_flush);
        self
    }

    /// Builds a `Preferences` with this configuration.
    pub const fn build(&self) -> Preferences {
        self.prefs
    }
}

impl From<Preferences> for PreferencesBuilder {
    fn from(prefs: Preferences) -> Self {
        Self { prefs }
    }
}

#[cfg(test)]
mod tests {
    use crate::lz4f::{
        BlockChecksum, BlockMode, BlockSize, ContentChecksum, FavorDecSpeed, Preferences,
        PreferencesBuilder, CLEVEL_DEFAULT, CLEVEL_HIGH, CLEVEL_MAX,
    };
    use std::{i32, u32};

    #[test]
    fn preferences_builder() {
        assert_eq!(PreferencesBuilder::new().build(), Preferences::default());
        assert_eq!(
            PreferencesBuilder::new()
                .favor_dec_speed(FavorDecSpeed::Enabled)
                .build()
                .favor_dec_speed,
            FavorDecSpeed::Enabled
        );
        assert_eq!(
            PreferencesBuilder::new()
                .block_size(BlockSize::Max64KB)
                .build()
                .frame_info
                .block_size(),
            BlockSize::Max64KB
        );
        assert_eq!(
            PreferencesBuilder::new()
                .block_size(BlockSize::Max256KB)
                .build()
                .frame_info
                .block_size(),
            BlockSize::Max256KB
        );
        assert_eq!(
            PreferencesBuilder::new()
                .block_size(BlockSize::Max1MB)
                .build()
                .frame_info
                .block_size(),
            BlockSize::Max1MB
        );
        assert_eq!(
            PreferencesBuilder::new()
                .block_size(BlockSize::Max4MB)
                .build()
                .frame_info
                .block_size(),
            BlockSize::Max4MB
        );
        assert_eq!(
            PreferencesBuilder::new()
                .content_checksum(ContentChecksum::Enabled)
                .build()
                .frame_info
                .content_checksum(),
            ContentChecksum::Enabled
        );
        assert_eq!(
            PreferencesBuilder::new()
                .block_mode(BlockMode::Independent)
                .build()
                .frame_info
                .block_mode(),
            BlockMode::Independent
        );
        assert_eq!(
            PreferencesBuilder::new()
                .compression_level(i32::MAX)
                .build()
                .compression_level,
            i32::MAX
        );
        assert_eq!(
            PreferencesBuilder::new()
                .compression_level(CLEVEL_DEFAULT)
                .build()
                .compression_level,
            CLEVEL_DEFAULT
        );
        assert_eq!(
            PreferencesBuilder::new()
                .compression_level(CLEVEL_HIGH)
                .build()
                .compression_level,
            CLEVEL_HIGH
        );
        assert_eq!(
            PreferencesBuilder::new()
                .compression_level(CLEVEL_MAX)
                .build()
                .compression_level,
            CLEVEL_MAX
        );
        assert_eq!(
            PreferencesBuilder::new()
                .compression_level(i32::MIN)
                .build()
                .compression_level,
            i32::MIN
        );
        assert_eq!(
            PreferencesBuilder::new()
                .block_checksum(BlockChecksum::Enabled)
                .build()
                .frame_info
                .block_checksum(),
            BlockChecksum::Enabled
        );
        assert_eq!(
            PreferencesBuilder::new()
                .dict_id(u32::MAX)
                .build()
                .frame_info
                .dict_id(),
            u32::MAX
        );
        assert_eq!(
            PreferencesBuilder::new()
                .dict_id(u32::MIN)
                .build()
                .frame_info
                .dict_id(),
            u32::MIN
        );
    }
}
