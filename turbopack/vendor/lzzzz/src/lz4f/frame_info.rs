use std::os::raw::{c_uint, c_ulonglong};

/// Block size flag.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[non_exhaustive]
#[repr(C)]
pub enum BlockSize {
    Default = 0,
    Max64KB = 4,
    Max256KB = 5,
    Max1MB = 6,
    Max4MB = 7,
}

impl Default for BlockSize {
    fn default() -> Self {
        Self::Default
    }
}

/// Block mode flag.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[repr(C)]
pub enum BlockMode {
    Linked,
    Independent,
}

impl Default for BlockMode {
    fn default() -> Self {
        Self::Linked
    }
}

/// Content checksum flag.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[repr(C)]
pub enum ContentChecksum {
    Disabled,
    Enabled,
}

impl Default for ContentChecksum {
    fn default() -> Self {
        Self::Disabled
    }
}

/// Frame type flag.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[repr(C)]
pub enum FrameType {
    Frame,
    SkippableFrame,
}

impl Default for FrameType {
    fn default() -> Self {
        Self::Frame
    }
}

/// Block checksum flag.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[repr(C)]
pub enum BlockChecksum {
    Disabled,
    Enabled,
}

impl Default for BlockChecksum {
    fn default() -> Self {
        Self::Disabled
    }
}

/// LZ4 Frame parameters.
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Hash)]
#[repr(C)]
pub struct FrameInfo {
    block_size: BlockSize,
    block_mode: BlockMode,
    content_checksum: ContentChecksum,
    frame_type: FrameType,
    content_size: c_ulonglong,
    dict_id: c_uint,
    block_checksum: BlockChecksum,
}

impl FrameInfo {
    /// Returns the block size.
    pub const fn block_size(&self) -> BlockSize {
        self.block_size
    }

    /// Returns the block mode.
    pub const fn block_mode(&self) -> BlockMode {
        self.block_mode
    }

    /// Returns the content checksum.
    pub const fn content_checksum(&self) -> ContentChecksum {
        self.content_checksum
    }

    /// Returns the frame type.
    pub const fn frame_type(&self) -> FrameType {
        self.frame_type
    }

    /// Returns the content size.
    pub const fn content_size(&self) -> usize {
        self.content_size as usize
    }

    /// Returns the dictionary id.
    pub const fn dict_id(&self) -> u32 {
        self.dict_id
    }

    /// Returns the block checksum.
    pub const fn block_checksum(&self) -> BlockChecksum {
        self.block_checksum
    }

    pub(super) fn set_block_size(&mut self, block_size: BlockSize) {
        self.block_size = block_size;
    }

    pub(super) fn set_block_mode(&mut self, block_mode: BlockMode) {
        self.block_mode = block_mode;
    }

    pub(super) fn set_content_checksum(&mut self, checksum: ContentChecksum) {
        self.content_checksum = checksum;
    }

    pub(super) fn set_content_size(&mut self, size: usize) {
        self.content_size = size as c_ulonglong;
    }

    pub(super) fn set_dict_id(&mut self, dict_id: u32) {
        self.dict_id = dict_id as c_uint;
    }

    pub(super) fn set_block_checksum(&mut self, checksum: BlockChecksum) {
        self.block_checksum = checksum;
    }
}
