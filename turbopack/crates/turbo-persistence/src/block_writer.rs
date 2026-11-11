//! Writes the blocks of an SST file, compressing them in parallel when a
//! [`ParallelScheduler`] with more than one thread is available.
//!
//! Blocks are assigned their index when they are submitted, but compressing and writing them can be
//! deferred: submitted blocks are queued until the queue holds [`QUEUE_BYTES`] of data, then the
//! whole queue is compressed in parallel and written to the file in submission order. The bytes on
//! disk are therefore identical to compressing and writing every block on submission, which is
//! what happens with a single-threaded scheduler.
//!
//! The queue bounds the extra memory: at most [`QUEUE_BYTES`] plus one block of uncompressed data,
//! and their compressed copies, are buffered per writer, and at most [`QUEUE_BYTES`] of buffer
//! capacity is kept for reuse. Blocks larger than [`MAX_QUEUED_BLOCK_SIZE`] are never copied into
//! the queue: the queue is flushed and the block is compressed and written directly from the
//! caller's buffer.

use std::{
    io::{BufWriter, Write},
    mem::take,
};

use anyhow::{Context, Result};
use byteorder::{BE, WriteBytesExt};
use fs_err::File;

use crate::{
    Compression,
    compression::{Compressor, checksum_block},
    parallel_scheduler::ParallelScheduler,
    static_sorted_file_builder::BLOCK_HEADER_SIZE,
};

/// Uncompressed bytes the queue accumulates before it is compressed in parallel and written.
const QUEUE_BYTES: usize = 512 * 1024;

/// Blocks larger than this bypass the queue (see the module docs).
const MAX_QUEUED_BLOCK_SIZE: usize = 256 * 1024;

/// Target amount of uncompressed data per parallel compression job. Small enough to spread a full
/// queue over many threads, large enough that a job outweighs its scheduling overhead.
const JOB_BYTES: usize = 64 * 1024;

/// Writes a raw (already-formatted) block to the file. Returns the block index assigned.
///
/// `uncompressed_size` is the original uncompressed size of the block data, or `0` if the block
/// is stored uncompressed.
fn write_raw_block_to_file(
    file: &mut BufWriter<File>,
    block_offsets: &mut Vec<u32>,
    uncompressed_size: u32,
    checksum: u32,
    block: &[u8],
) -> Result<u16> {
    let block_index: u16 = block_offsets
        .len()
        .try_into()
        .expect("Block index overflow");

    let len: u32 = (block.len() + BLOCK_HEADER_SIZE).try_into().unwrap();
    let offset = block_offsets
        .last()
        .copied()
        .unwrap_or_default()
        .checked_add(len)
        .expect("Block offset overflow");
    block_offsets.push(offset);

    file.write_u32::<BE>(uncompressed_size)
        .context("Failed to write uncompressed size")?;
    file.write_u32::<BE>(checksum)
        .context("Failed to write checksum")?;
    file.write_all(block)
        .context("Failed to write block data")?;
    Ok(block_index)
}

/// Compresses `block` into `compress_buffer` if requested and worthwhile.
///
/// Returns the `uncompressed_size` to store in the block header (`0` for an uncompressed block)
/// and whether `compress_buffer` holds the data to write (otherwise `block` is written as is).
fn compress_block(
    block: &[u8],
    try_compress: bool,
    compressor: &mut Compressor,
    compress_buffer: &mut Vec<u8>,
) -> Result<(u32, bool)> {
    if !try_compress {
        return Ok((0, false));
    }
    compressor.compress_into_buffer(block, compress_buffer)?;
    // Same threshold as LevelDB/RocksDB: require at least 12.5% savings.
    if compress_buffer.len() < block.len() - (block.len() / 8) {
        Ok((block.len().try_into().unwrap(), true))
    } else {
        Ok((0, false))
    }
}

/// A block waiting in the queue.
struct QueuedBlock {
    /// The block data: uncompressed for [`QueuedKind::Compress`], on-disk bytes for
    /// [`QueuedKind::Raw`].
    data: Vec<u8>,
    /// The compressed data, valid after compression if [`QueuedBlock::use_compressed`] is set.
    compressed: Vec<u8>,
    kind: QueuedKind,
    /// The header fields, filled in by [`QueuedBlock::compress`].
    uncompressed_size: u32,
    checksum: u32,
    use_compressed: bool,
}

#[derive(Clone, Copy)]
enum QueuedKind {
    /// Compress the block (if `try_compress` and worthwhile) before writing it.
    Compress { try_compress: bool },
    /// The block is already in its on-disk form.
    Raw {
        uncompressed_size: u32,
        checksum: u32,
    },
}

impl QueuedBlock {
    fn compress(&mut self, compressor: &mut Compressor) -> Result<()> {
        match self.kind {
            QueuedKind::Compress { try_compress } => {
                let (uncompressed_size, use_compressed) =
                    compress_block(&self.data, try_compress, compressor, &mut self.compressed)?;
                self.uncompressed_size = uncompressed_size;
                self.use_compressed = use_compressed;
                // Checksum is computed on the on-disk data (after compression).
                self.checksum = checksum_block(self.on_disk_data());
            }
            QueuedKind::Raw {
                uncompressed_size,
                checksum,
            } => {
                self.uncompressed_size = uncompressed_size;
                self.checksum = checksum;
                self.use_compressed = false;
            }
        }
        Ok(())
    }

    /// The capacity of the buffers, retained when the block is reused.
    fn capacity(&self) -> usize {
        self.data.capacity() + self.compressed.capacity()
    }

    fn on_disk_data(&self) -> &[u8] {
        if self.use_compressed {
            &self.compressed
        } else {
            &self.data
        }
    }
}

/// Assigns block indices and writes the blocks of one SST file, see the module docs.
pub(crate) struct BlockWriter<S: ParallelScheduler> {
    scheduler: S,
    compression: Compression,
    /// Whether blocks are queued and compressed in parallel.
    parallel: bool,
    compressor: Compressor,
    compress_buffer: Vec<u8>,
    /// End offsets of the blocks written to the file so far.
    block_offsets: Vec<u32>,
    /// Blocks submitted but not written yet, in submission order.
    queue: Vec<QueuedBlock>,
    /// Uncompressed bytes in `queue`.
    queue_bytes: usize,
    /// Written queue entries, kept to reuse their buffers.
    spare: Vec<QueuedBlock>,
    /// The total buffer capacity of `spare`, at most [`QUEUE_BYTES`].
    spare_capacity: usize,
}

impl<S: ParallelScheduler> BlockWriter<S> {
    pub(crate) fn new(
        compression: Compression,
        scheduler: S,
        estimated_block_count: usize,
        max_block_size: usize,
    ) -> Result<Self> {
        let parallel = scheduler.parallelism() > 1;
        Ok(Self {
            scheduler,
            compression,
            parallel,
            compressor: Compressor::new(compression)?,
            compress_buffer: Vec::with_capacity(max_block_size),
            block_offsets: Vec::with_capacity(estimated_block_count),
            queue: Vec::new(),
            queue_bytes: 0,
            spare: Vec::new(),
            spare_capacity: 0,
        })
    }

    /// The number of blocks submitted so far, including queued ones. This is the index the next
    /// submitted block gets.
    pub(crate) fn block_count(&self) -> usize {
        self.block_offsets.len() + self.queue.len()
    }

    /// Submits a block, compressing it if `try_compress` is set and it saves enough. Returns the
    /// block index assigned.
    pub(crate) fn write_block(
        &mut self,
        file: &mut BufWriter<File>,
        block: &[u8],
        try_compress: bool,
    ) -> Result<u16> {
        if !self.should_queue(block) {
            self.flush(file)?;
            let (uncompressed_size, use_compressed) = compress_block(
                block,
                try_compress,
                &mut self.compressor,
                &mut self.compress_buffer,
            )?;
            let data = if use_compressed {
                &self.compress_buffer[..]
            } else {
                block
            };
            // Checksum is computed on the on-disk data (after compression).
            let checksum = checksum_block(data);
            return write_raw_block_to_file(
                file,
                &mut self.block_offsets,
                uncompressed_size,
                checksum,
                data,
            );
        }
        self.enqueue(file, block, QueuedKind::Compress { try_compress })
    }

    /// Submits a block that is already in its on-disk form. Returns the block index assigned.
    pub(crate) fn write_raw_block(
        &mut self,
        file: &mut BufWriter<File>,
        uncompressed_size: u32,
        checksum: u32,
        block: &[u8],
    ) -> Result<u16> {
        if !self.should_queue(block) {
            self.flush(file)?;
            return write_raw_block_to_file(
                file,
                &mut self.block_offsets,
                uncompressed_size,
                checksum,
                block,
            );
        }
        self.enqueue(
            file,
            block,
            QueuedKind::Raw {
                uncompressed_size,
                checksum,
            },
        )
    }

    fn should_queue(&self, block: &[u8]) -> bool {
        self.parallel && block.len() <= MAX_QUEUED_BLOCK_SIZE
    }

    fn enqueue(
        &mut self,
        file: &mut BufWriter<File>,
        block: &[u8],
        kind: QueuedKind,
    ) -> Result<u16> {
        let block_index: u16 = self.block_count().try_into().expect("Block index overflow");
        let mut queued = if let Some(spare) = self.spare.pop() {
            self.spare_capacity -= spare.capacity();
            spare
        } else {
            QueuedBlock {
                data: Vec::new(),
                compressed: Vec::new(),
                kind,
                uncompressed_size: 0,
                checksum: 0,
                use_compressed: false,
            }
        };
        queued.data.clear();
        queued.data.extend_from_slice(block);
        queued.kind = kind;
        self.queue.push(queued);
        self.queue_bytes += block.len();
        if self.queue_bytes >= QUEUE_BYTES {
            self.flush(file)?;
        }
        Ok(block_index)
    }

    /// Compresses the queued blocks in parallel and writes them in submission order.
    pub(crate) fn flush(&mut self, file: &mut BufWriter<File>) -> Result<()> {
        if self.queue.is_empty() {
            return Ok(());
        }
        let mut queue = take(&mut self.queue);
        self.queue_bytes = 0;

        // Group consecutive blocks into jobs of about `JOB_BYTES`.
        let mut jobs: Vec<&mut [QueuedBlock]> = Vec::new();
        let mut rest = &mut queue[..];
        while !rest.is_empty() {
            let mut len = 0;
            let mut bytes = 0;
            while len < rest.len() && (len == 0 || bytes < JOB_BYTES) {
                bytes += rest[len].data.len();
                len += 1;
            }
            let (job, remaining) = rest.split_at_mut(len);
            jobs.push(job);
            rest = remaining;
        }
        if let [job] = &mut jobs[..] {
            for block in job.iter_mut() {
                block.compress(&mut self.compressor)?;
            }
        } else {
            let compression = self.compression;
            self.scheduler
                .try_parallel_for_each_task_mut(&mut jobs, |job| {
                    let mut compressor = Compressor::new(compression)?;
                    for block in job.iter_mut() {
                        block.compress(&mut compressor)?;
                    }
                    anyhow::Ok(())
                })?;
        }
        drop(jobs);

        for block in &queue {
            write_raw_block_to_file(
                file,
                &mut self.block_offsets,
                block.uncompressed_size,
                block.checksum,
                block.on_disk_data(),
            )?;
        }
        // Keep buffers for the next blocks, but at most `QUEUE_BYTES` of capacity in total: the
        // capacity of a reused buffer only grows, so keeping all of them could retain much more
        // than one queue's worth of memory.
        for block in queue.drain(..) {
            let capacity = block.capacity();
            if self.spare_capacity + capacity > QUEUE_BYTES {
                continue;
            }
            self.spare_capacity += capacity;
            self.spare.push(block);
        }
        // Reuse the (now empty) allocation of the queue itself.
        self.queue = queue;
        Ok(())
    }

    /// Writes all queued blocks, then writes `block` (in its on-disk form) as the last block of
    /// the file. Returns the end offsets of all blocks written.
    pub(crate) fn finish(
        &mut self,
        file: &mut BufWriter<File>,
        uncompressed_size: u32,
        checksum: u32,
        block: &[u8],
    ) -> Result<&[u32]> {
        self.flush(file)?;
        // Release the reusable buffers, they are not needed anymore.
        self.spare = Vec::new();
        self.spare_capacity = 0;
        write_raw_block_to_file(
            file,
            &mut self.block_offsets,
            uncompressed_size,
            checksum,
            block,
        )?;
        Ok(&self.block_offsets)
    }
}
