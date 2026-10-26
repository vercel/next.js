//! The bincode encoding of [`Bitset`].
//!
//! The encoding starts with an `i64` length header and has one of two forms, whichever is smaller:
//!
//! - `0`: the empty set.
//! - A positive length `len` (**bitmap form**): a `u32` byte offset followed by `len` raw bytes.
//!   Bit `j` of byte `i` is the bit `8 * (byte_offset + i) + j`. Leading and trailing zero bytes
//!   are trimmed, so the payload covers the minimal byte range.
//! - A negative length `-n` (**list form**): `n` bits in ascending order, the first one as a `u32`
//!   followed by `n - 1` `u32` differences to the previous bit (each at least 1).
//!
//! Integers use the encoder's integer encoding, so they are varints with the standard config. The
//! form is always chosen by comparing the sizes with varint integers, so the choice doesn't depend
//! on the config.
//!
//! The bitmap bytes are little-endian on every platform. Little-endian targets write them straight
//! from the storage; big-endian targets convert them one block at a time.

use bincode::{
    Decode, Encode,
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
        let bitmap_size = signed_varint_len(bitmap_len as i64)
            + varint_len(range.byte_offset)
            + bitmap_len as usize;
        // Every item takes at least one byte in the list form, so first count the bits, which
        // stops early (quickly for dense sets) once that lower bound reaches the size of the
        // bitmap form. Then add the bytes of the larger items, computed from the blocks. Once the
        // list form is known to be smaller, the header is known, and the items are written
        // straight into the encoder in a single pass over the bits.
        let first_block = range.byte_offset as usize / BLOCK_BYTES;
        if let Some(count) = count_below(range.blocks, bitmap_size)
            && let lower_bound = signed_varint_len(-(count as i64)) + count
            && lower_bound < bitmap_size
            && list_extra_below(first_block, range.blocks, bitmap_size - lower_bound).is_some()
        {
            (-(count as i64)).encode(encoder)?;
            let mut previous: Option<u32> = None;
            for bit in self.iter() {
                match previous {
                    None => bit.encode(encoder)?,
                    Some(previous) => (bit - previous).encode(encoder)?,
                }
                previous = Some(bit);
            }
            return Ok(());
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

fn decode_bitmap<D: Decoder>(decoder: &mut D, len: u64) -> Result<Bitset, DecodeError> {
    let byte_offset = u32::decode(decoder)? as u64;
    if len > MAX_BYTES || byte_offset + len > MAX_BYTES {
        return Err(DecodeError::Other(
            "Bitset bitmap extends beyond the u32 range",
        ));
    }
    let end_byte = (byte_offset + len) as usize;
    let byte_offset = byte_offset as usize;
    let first_block = byte_offset / BLOCK_BYTES;
    let end_block = end_byte.div_ceil(BLOCK_BYTES);
    let block_count = end_block - first_block;
    decoder.claim_bytes_read(block_count * BLOCK_BYTES)?;
    let mut blocks = Vec::with_capacity(block_count);
    for index in 0..block_count {
        let block_start = (first_block + index) * BLOCK_BYTES;
        let start = byte_offset.saturating_sub(block_start);
        let end = (end_byte - block_start).min(BLOCK_BYTES);
        let mut bytes = [0; BLOCK_BYTES];
        decoder.reader().read(&mut bytes[start..end])?;
        blocks.push(usize::from_le_bytes(bytes));
    }
    Ok(Bitset {
        offset: first_block,
        blocks,
    })
}

fn decode_list<D: Decoder>(decoder: &mut D, count: u64) -> Result<Bitset, DecodeError> {
    if count > 1 << 32 {
        return Err(DecodeError::Other(
            "Bitset list has more items than the u32 range",
        ));
    }
    // Set the bits directly in the storage. The bits are ascending, so it only grows at the back,
    // and the bytes of every new block are claimed from the decoder's limit before allocating
    // them (each item takes at least one byte of input, but a single item can add many blocks).
    let first = u32::decode(decoder)?;
    let offset = first as usize / BLOCK_BITS;
    let mut blocks: Vec<usize> = Vec::new();
    let mut set_bit = |decoder: &mut D, bit: u32| -> Result<(), DecodeError> {
        let index = bit as usize / BLOCK_BITS - offset;
        if index >= blocks.len() {
            decoder.claim_bytes_read((index + 1 - blocks.len()) * BLOCK_BYTES)?;
            blocks.resize(index + 1, 0);
        }
        blocks[index] |= 1 << (bit as usize % BLOCK_BITS);
        Ok(())
    };
    set_bit(decoder, first)?;
    let mut previous = first;
    for _ in 1..count {
        let difference = u32::decode(decoder)?;
        if difference == 0 {
            return Err(DecodeError::Other("Bitset list is not strictly ascending"));
        }
        previous = previous
            .checked_add(difference)
            .ok_or(DecodeError::Other("Bitset list exceeds the u32 range"))?;
        set_bit(decoder, previous)?;
    }
    // The storage grew with amortized reallocations, so drop the spare capacity.
    blocks.shrink_to_fit();
    Ok(Bitset { offset, blocks })
}

#[cfg(test)]
mod tests {
    use bincode::enc::write::SliceWriter;

    use super::{write_bitmap, write_bitmap_per_block};
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
}
