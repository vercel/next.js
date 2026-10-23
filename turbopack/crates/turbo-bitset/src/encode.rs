//! The bincode encoding of [`Bitset`].
//!
//! The encoding starts with an `i64` length header and has one of two forms:
//!
//! - `0`: the empty set.
//! - A positive length `len` (**bitmap form**): a `u32` byte offset followed by `len` raw bytes.
//!   Bit `j` of byte `i` is the bit `8 * (byte_offset + i) + j`. Leading and trailing zero bytes
//!   are trimmed, so the payload covers the minimal byte range.
//! - A negative length `-n` (**list form**): a `u32` with the payload length the bitmap form would
//!   have (so the decoder can allocate the storage at once), then `n` bits in ascending order, the
//!   first one as a `u32` followed by `n - 1` `u32` differences to the previous bit (each at least
//!   1). The bits must cover exactly that payload range.
//!
//! Integers use the encoder's integer encoding (varints with the standard config) and endianness.
//! The bitmap bytes are little-endian on every platform. Little-endian targets copy them straight
//! from and to the storage; big-endian targets convert them one block at a time.
//!
//! With varint integers the list form is used only if it is smaller than 80% of the bitmap form:
//! the bitmap form is much faster to write and read, which is worth a slightly larger encoding.
//! With fixed-width integers (used to hash values instead of storing them) the bitmap form is
//! always used, as it avoids computing the sizes. The decoder accepts both forms with any config.

use bincode::{
    Decode, Encode,
    config::{Config, Endianness, IntEncoding},
    de::{Decoder, read::Reader},
    enc::{Encoder, write::Writer},
    error::{DecodeError, EncodeError},
    impl_borrow_decode,
};

use crate::{BLOCK_BITS, Bitset};

/// Number of bytes per storage block.
const BLOCK_BYTES: usize = BLOCK_BITS / 8;

/// The number of bytes needed to store every `u32` bit.
const MAX_BYTES: u64 = 1 << 29;

/// The list form is used only if its size is below this fraction of the bitmap form's size.
const LIST_RATIO: (usize, usize) = (4, 5);

/// The size of `value` as a bincode varint.
fn varint_len(value: u64) -> usize {
    match value {
        0..=250 => 1,
        251..=0xffff => 3,
        0x1_0000..=0xffff_ffff => 5,
        _ => 9,
    }
}

/// The size of `value` as a bincode (zigzag) signed varint.
fn signed_varint_len(value: i64) -> usize {
    varint_len(((value << 1) ^ (value >> 63)) as u64)
}

/// The trimmed byte range of a set's bits: the byte offset of the first non-zero byte, the
/// trimmed blocks, and the number of zero bytes to skip at the start of the first and at the end
/// of the last block.
struct ByteRange<'a> {
    byte_offset: u64,
    blocks: &'a [usize],
    skip_front: usize,
    skip_back: usize,
}

impl ByteRange<'_> {
    fn len(&self) -> u64 {
        (self.blocks.len() * BLOCK_BYTES - self.skip_front - self.skip_back) as u64
    }
}

/// Writes the bitmap bytes of `range`. On little-endian targets the in-memory bytes of the blocks
/// are the bitmap bytes in order, so this is a single write of the trimmed bytes.
#[cfg(target_endian = "little")]
fn write_bitmap<W: Writer>(writer: &mut W, range: &ByteRange<'_>) -> Result<(), EncodeError> {
    // SAFETY: The slice covers exactly the memory of `range.blocks` and borrows it for its
    // lifetime. Every byte of a `usize` is initialized, and `u8` has no alignment or validity
    // requirements.
    let bytes = unsafe {
        std::slice::from_raw_parts(
            range.blocks.as_ptr().cast::<u8>(),
            size_of_val(range.blocks),
        )
    };
    writer.write(&bytes[range.skip_front..bytes.len() - range.skip_back])
}

#[cfg(not(target_endian = "little"))]
use self::write_bitmap_per_block as write_bitmap;

/// Writes the bitmap bytes of `range`, converting each block to little-endian bytes. This is how
/// big-endian targets write the bitmap (it is also compiled for tests, which compare it with the
/// little-endian fast path).
#[cfg(any(not(target_endian = "little"), test))]
fn write_bitmap_per_block<W: Writer>(
    writer: &mut W,
    range: &ByteRange<'_>,
) -> Result<(), EncodeError> {
    let last = range.blocks.len() - 1;
    for (index, &block) in range.blocks.iter().enumerate() {
        let start = if index == 0 { range.skip_front } else { 0 };
        let end = if index == last {
            BLOCK_BYTES - range.skip_back
        } else {
            BLOCK_BYTES
        };
        writer.write(&block.to_le_bytes()[start..end])?;
    }
    Ok(())
}

/// The number of bits in `blocks`, if it is below `limit`.
fn count_below(blocks: &[usize], limit: usize) -> Option<usize> {
    let mut count = 0;
    // Check the limit per chunk, so that the counting itself stays a simple (vectorized) loop.
    for chunk in blocks.chunks(16) {
        count += chunk.iter().map(|b| b.count_ones() as usize).sum::<usize>();
        if count >= limit {
            return None;
        }
    }
    Some(count)
}

/// The number of bytes that the items of the list form take beyond one byte per item, for the bits
/// in `blocks` (whose first block has the index `first_block`), if that is below `limit`.
///
/// This works on whole blocks instead of iterating the bits: an item takes 3 or 5 bytes instead of
/// one only if it is more than 250 (the first bit, or a difference). Differences within a block are
/// below `BLOCK_BITS`, so only the difference to the first bit of a block can be that large.
fn list_extra_below(first_block: usize, blocks: &[usize], limit: usize) -> Option<usize> {
    let mut extra = 0;
    // The previous bit, initially as if it were bit 0, so the first bit's size is its own.
    let mut previous = 0;
    for (index, &block) in blocks.iter().enumerate() {
        if block == 0 {
            continue;
        }
        let base = ((first_block + index) * BLOCK_BITS) as u64;
        extra += varint_len(base + block.trailing_zeros() as u64 - previous) - 1;
        if extra >= limit {
            return None;
        }
        previous = base + (BLOCK_BITS - 1 - block.leading_zeros() as usize) as u64;
    }
    Some(extra)
}

/// The number of bits of the list form, if the policy chooses the list form over a bitmap form
/// with `bitmap_size` bytes: only if the list form's size is below `ceil(LIST_RATIO *
/// bitmap_size)`.
fn list_form_count(range: &ByteRange<'_>, bitmap_size: usize) -> Option<usize> {
    let limit = (bitmap_size * LIST_RATIO.0).div_ceil(LIST_RATIO.1);
    // Every item takes at least one byte, so first count the bits, which stops early (quickly for
    // dense sets) once that lower bound reaches the limit. Then add the bytes of the larger items,
    // computed from the blocks.
    let count = count_below(range.blocks, limit)?;
    let lower_bound = signed_varint_len(-(count as i64)) + varint_len(range.len()) + count;
    if lower_bound >= limit {
        return None;
    }
    let first_block = range.byte_offset as usize / BLOCK_BYTES;
    list_extra_below(first_block, range.blocks, limit - lower_bound)?;
    Some(count)
}

/// Appends `value` as a bincode varint to `buffer` at `pos`, which has room for 5 bytes.
#[inline(always)]
fn push_varint(buffer: &mut [u8], pos: &mut usize, value: u32, big_endian: bool) {
    if value <= 250 {
        buffer[*pos] = value as u8;
        *pos += 1;
    } else if value <= u16::MAX as u32 {
        let bytes = if big_endian {
            (value as u16).to_be_bytes()
        } else {
            (value as u16).to_le_bytes()
        };
        buffer[*pos] = 251;
        buffer[*pos + 1..*pos + 3].copy_from_slice(&bytes);
        *pos += 3;
    } else {
        let bytes = if big_endian {
            value.to_be_bytes()
        } else {
            value.to_le_bytes()
        };
        buffer[*pos] = 252;
        buffer[*pos + 1..*pos + 5].copy_from_slice(&bytes);
        *pos += 5;
    }
}

/// Writes the items of the list form (the first bit and the differences) as varints.
///
/// The items are collected in a stack buffer that is written in large chunks, as a write per item
/// is slow with many writers. Within a block, the differences are below `BLOCK_BITS`, so only the
/// first bit of each block needs the general varint encoding.
fn write_list_items<W: Writer>(
    writer: &mut W,
    first_block: usize,
    blocks: &[usize],
    big_endian: bool,
) -> Result<(), EncodeError> {
    const BUFFER_LEN: usize = 1024;
    // A block takes at most 5 bytes for its first item and one byte for each other item.
    const BLOCK_MAX_LEN: usize = 5 + BLOCK_BITS - 1;
    let mut buffer = [0u8; BUFFER_LEN];
    let mut pos = 0;
    let mut previous = 0u32;
    for (index, &block) in blocks.iter().enumerate() {
        if block == 0 {
            continue;
        }
        if pos + BLOCK_MAX_LEN > BUFFER_LEN {
            writer.write(&buffer[..pos])?;
            pos = 0;
        }
        // Bits are `u32`, so the bits of a block fit too.
        let base = ((first_block + index) * BLOCK_BITS) as u32;
        let mut last = block.trailing_zeros();
        push_varint(&mut buffer, &mut pos, base + last - previous, big_endian);
        let mut rest = block & (block - 1);
        while rest != 0 {
            let bit = rest.trailing_zeros();
            buffer[pos] = (bit - last) as u8;
            pos += 1;
            last = bit;
            rest &= rest - 1;
        }
        previous = base + last;
    }
    writer.write(&buffer[..pos])
}

impl Bitset {
    /// The trimmed byte range of the set, or `None` if it is empty.
    fn byte_range(&self) -> Option<ByteRange<'_>> {
        let (first_block, blocks) = self.trimmed();
        let (&first, &last) = (blocks.first()?, blocks.last()?);
        let skip_front = first.trailing_zeros() as usize / 8;
        let skip_back = last.leading_zeros() as usize / 8;
        Some(ByteRange {
            byte_offset: (first_block * BLOCK_BYTES + skip_front) as u64,
            blocks,
            skip_front,
            skip_back,
        })
    }
}

impl Encode for Bitset {
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        let Some(range) = self.byte_range() else {
            return 0i64.encode(encoder);
        };
        let bitmap_len = range.len();
        // The list form is only used with varint integers, see the module docs.
        if matches!(encoder.config().int_encoding(), IntEncoding::Variable) {
            let bitmap_size = signed_varint_len(bitmap_len as i64)
                + varint_len(range.byte_offset)
                + bitmap_len as usize;
            if let Some(count) = list_form_count(&range, bitmap_size) {
                let big_endian = matches!(encoder.config().endianness(), Endianness::Big);
                (-(count as i64)).encode(encoder)?;
                // The payload is at most `MAX_BYTES`, so it fits into `u32`.
                (bitmap_len as u32).encode(encoder)?;
                let first_block = range.byte_offset as usize / BLOCK_BYTES;
                return write_list_items(encoder.writer(), first_block, range.blocks, big_endian);
            }
        }

        (bitmap_len as i64).encode(encoder)?;
        // The byte offset is below `MAX_BYTES`, so it fits into `u32`.
        (range.byte_offset as u32).encode(encoder)?;
        write_bitmap(encoder.writer(), &range)
    }
}

impl<Context> Decode<Context> for Bitset {
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        let len = i64::decode(decoder)?;
        match len {
            0 => Ok(Self::new()),
            1.. => decode_bitmap(decoder, len as u64),
            _ => decode_list(decoder, len.unsigned_abs()),
        }
    }
}

impl_borrow_decode!(Bitset);

/// Allocates the zeroed storage for the bytes `byte_offset..byte_offset + len`, claiming its size
/// from the decoder's limit first. Returns the index of the first block and the storage.
fn allocate<D: Decoder>(
    decoder: &mut D,
    byte_offset: u64,
    len: u64,
) -> Result<(usize, Vec<usize>), DecodeError> {
    if len > MAX_BYTES || byte_offset + len > MAX_BYTES {
        return Err(DecodeError::Other("Bitset extends beyond the u32 range"));
    }
    let block_bytes = BLOCK_BYTES as u64;
    let first_block = byte_offset / block_bytes;
    let block_count = ((byte_offset + len).div_ceil(block_bytes) - first_block) as usize;
    decoder.claim_bytes_read(block_count * BLOCK_BYTES)?;
    Ok((first_block as usize, vec![0; block_count]))
}

fn decode_bitmap<D: Decoder>(decoder: &mut D, len: u64) -> Result<Bitset, DecodeError> {
    let byte_offset = u32::decode(decoder)? as u64;
    let (first_block, mut blocks) = allocate(decoder, byte_offset, len)?;
    // Read the payload straight into the storage's bytes.
    let start = (byte_offset - first_block as u64 * BLOCK_BYTES as u64) as usize;
    // SAFETY: The slice covers exactly the memory of `blocks` and borrows it mutably for its
    // lifetime. `u8` has no alignment requirements, and every byte pattern is a valid `usize`.
    let bytes = unsafe {
        std::slice::from_raw_parts_mut(blocks.as_mut_ptr().cast::<u8>(), size_of_val(&*blocks))
    };
    decoder
        .reader()
        .read(&mut bytes[start..start + len as usize])?;
    le_blocks_to_native(&mut blocks, cfg!(target_endian = "big"));
    Ok(Bitset {
        offset: first_block,
        blocks,
    })
}

/// Converts blocks whose memory holds little-endian bytes to native blocks: a no-op on
/// little-endian targets, a byte swap on big-endian targets (`big_endian_target`).
#[inline]
fn le_blocks_to_native(blocks: &mut [usize], big_endian_target: bool) {
    if big_endian_target {
        for block in blocks {
            *block = block.swap_bytes();
        }
    }
}

/// Sets bits in a preallocated storage, keeping the bits of the current block in a register.
struct ListBuilder {
    /// The first bit of the storage.
    base: u64,
    /// The end of the bits that may be set (exclusive), relative to `base`.
    end: u64,
    blocks: Vec<usize>,
    /// The index of the current block and its bits, not yet stored in `blocks`.
    index: usize,
    word: usize,
    /// The last bit that was set, relative to `base`.
    last: u64,
}

impl ListBuilder {
    /// Sets the bit `last + difference`, which must be within the storage.
    #[inline(always)]
    fn push(&mut self, difference: u64) -> Result<(), DecodeError> {
        let bit = self.last + difference;
        if bit >= self.end {
            return Err(DecodeError::Other("Bitset list exceeds its payload range"));
        }
        let index = (bit / BLOCK_BITS as u64) as usize;
        if index != self.index {
            self.blocks[self.index] |= self.word;
            self.index = index;
            self.word = 0;
        }
        self.word |= 1 << (bit % BLOCK_BITS as u64);
        self.last = bit;
        Ok(())
    }

    fn finish(mut self) -> Vec<usize> {
        self.blocks[self.index] |= self.word;
        self.blocks
    }
}

/// Decodes one difference of the list form.
fn decode_difference<D: Decoder>(decoder: &mut D) -> Result<u64, DecodeError> {
    let difference = u32::decode(decoder)?;
    if difference == 0 {
        return Err(DecodeError::Other("Bitset list is not strictly ascending"));
    }
    Ok(difference as u64)
}

fn decode_list<D: Decoder>(decoder: &mut D, count: u64) -> Result<Bitset, DecodeError> {
    if count > 1 << 32 {
        return Err(DecodeError::Other(
            "Bitset list has more items than the u32 range",
        ));
    }
    let len = u32::decode(decoder)? as u64;
    if len == 0 || count > len * 8 {
        return Err(DecodeError::Other(
            "Bitset list doesn't fit into its payload range",
        ));
    }
    let first = u32::decode(decoder)? as u64;
    let byte_offset = first / 8;
    let (first_block, blocks) = allocate(decoder, byte_offset, len)?;
    let base = (first_block * BLOCK_BITS) as u64;
    let mut builder = ListBuilder {
        base,
        end: (byte_offset + len) * 8 - base,
        blocks,
        index: 0,
        word: 0,
        last: first - base,
    };
    builder.push(0)?;
    let mut remaining = count - 1;
    if matches!(decoder.config().int_encoding(), IntEncoding::Variable) {
        // Every item takes at least one byte, so a valid input has at least `remaining` more
        // bytes. Handle batches of single-byte items without going through the reader per item.
        const BATCH_LEN: usize = 256;
        let mut batch = [0u8; BATCH_LEN];
        while remaining > 0 {
            let batch_len = (remaining as usize).min(BATCH_LEN);
            let Some(bytes) = decoder.reader().peek_read(batch_len) else {
                break;
            };
            batch[..batch_len].copy_from_slice(bytes);
            // Claim the input like `u32::decode` does, for the whole batch first: a valid input
            // has all these items, and each of them claims at least that much.
            decoder.claim_bytes_read(4 * batch_len)?;
            let mut used = 0;
            for &byte in &batch[..batch_len] {
                // Zero is an invalid difference and larger values are multi-byte varints, which
                // are left to the generic path below.
                if byte == 0 || byte > 250 || builder.last + byte as u64 >= builder.end {
                    break;
                }
                builder.push(byte as u64)?;
                used += 1;
            }
            decoder.unclaim_bytes_read(4 * (batch_len - used));
            decoder.reader().consume(used);
            remaining -= used as u64;
            if used < batch_len {
                builder.push(decode_difference(decoder)?)?;
                remaining -= 1;
            }
        }
    }
    for _ in 0..remaining {
        builder.push(decode_difference(decoder)?)?;
    }
    // The bits must end in the last byte of the payload range, so the encoding is canonical.
    if (builder.base + builder.last) / 8 != byte_offset + len - 1 {
        return Err(DecodeError::Other(
            "Bitset list doesn't end in the last byte of its payload range",
        ));
    }
    Ok(Bitset {
        offset: first_block,
        blocks: builder.finish(),
    })
}

#[cfg(test)]
mod tests {
    use bincode::enc::write::SliceWriter;

    use super::{le_blocks_to_native, write_bitmap, write_bitmap_per_block};
    use crate::Bitset;

    fn written(
        set: &Bitset,
        write: impl Fn(
            &mut SliceWriter<'_>,
            &super::ByteRange<'_>,
        ) -> Result<(), bincode::error::EncodeError>,
    ) -> Vec<u8> {
        let range = set.byte_range().unwrap();
        let mut buffer = vec![0; range.len() as usize];
        let mut writer = SliceWriter::new(&mut buffer);
        write(&mut writer, &range).unwrap();
        assert_eq!(writer.bytes_written(), buffer.len());
        buffer
    }

    /// The single-write bitmap path writes the same bytes as the per-block path that big-endian
    /// targets use, for every combination of trimmed bytes at the front and back.
    #[test]
    fn bitmap_paths_write_the_same_bytes() {
        let block_bits = usize::BITS;
        for first in 0..block_bits {
            for blocks in 0..3 {
                for last in [0, 7, 8, 31, block_bits - 1] {
                    let base = 3 * block_bits;
                    let end = base + blocks * block_bits + last;
                    let start = (base + first).min(end);
                    let set: Bitset = [start, (start + end) / 2, end].into_iter().collect();
                    let expected = written(&set, |w, r| write_bitmap_per_block(w, r));
                    assert_eq!(written(&set, |w, r| write_bitmap(w, r)), expected);
                    // Bit `j` of byte `i` is the bit `8 * (byte_offset + i) + j`.
                    let byte_offset = set.byte_range().unwrap().byte_offset as u32;
                    let decoded: Vec<u32> = expected
                        .iter()
                        .enumerate()
                        .flat_map(|(i, &byte)| {
                            (0..8)
                                .filter(move |j| byte & (1 << j) != 0)
                                .map(move |j| 8 * (byte_offset + i as u32) + j)
                        })
                        .collect();
                    assert_eq!(decoded, set.iter().collect::<Vec<_>>());
                }
            }
        }
    }

    /// The decoder reads the little-endian payload bytes straight into the storage's memory. On a
    /// big-endian target that memory holds each block as `from_be_bytes` of its payload bytes, and
    /// the conversion must produce the `from_le_bytes` blocks. On a little-endian target the memory
    /// already holds those, and the conversion must not change them.
    #[test]
    fn bitmap_read_byte_order() {
        const BLOCK_BYTES: usize = super::BLOCK_BYTES;
        let payload: Vec<u8> = (0..4 * BLOCK_BYTES as u8)
            .map(|i| i.wrapping_mul(37) ^ 0xa5)
            .collect();
        for len in 1..=payload.len() / BLOCK_BYTES {
            let (chunks, _) = payload[..len * BLOCK_BYTES].as_chunks::<BLOCK_BYTES>();
            let expected: Vec<usize> = chunks.iter().map(|&c| usize::from_le_bytes(c)).collect();
            let mut big_endian_memory: Vec<usize> =
                chunks.iter().map(|&c| usize::from_be_bytes(c)).collect();
            le_blocks_to_native(&mut big_endian_memory, true);
            assert_eq!(big_endian_memory, expected);
            let mut little_endian_memory = expected.clone();
            le_blocks_to_native(&mut little_endian_memory, false);
            assert_eq!(little_endian_memory, expected);
        }
    }
}
