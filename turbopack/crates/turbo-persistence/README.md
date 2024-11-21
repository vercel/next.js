# turbo-persistence

This crate provides a way to persist key value pairs into a folder and restore them later.

The API only allows a single write transaction at a time, but multiple threads can fill the transaction with (non-conflicting) data concurrently.

When pushing data into the WriteBatch it is already persisted to disk, but only becomes visible after the transaction is committed. On startup left-over uncommitted files on disk are automatically cleaned up.

The architecture is optimized for pushing a lot data to disk in a single transaction, while still allowing for fast random reads.

## On disk format

There is a single `CURRENT` file which stores the latest committed sequence number.

All other files have a sequence number as file name, e. g. `0000123.sst`. All files are immutable once there sequence number is <= the committed sequence number. But they might be deleted when they are superseeded by other committed files.

There are two different file types:

* Static Sorted Table (SST, `*.sst`): These files contain key value pairs.
* Blob files (`*.blob`): These files contain large values.

Therefore there are there value types:

* INLINE: Small values that are stored directly in the `*.sst` files.
* BLOB: Large values that are stored in `*.blob` files.
* DELETED: Values that are deleted. (Thumbstone)
* Future:
  * MERGE: An application specific update operation that is applied on the old value.

### SST file

* Headers
  * 4 bytes magic number and version
  * 3 bytes AQMF length
  * 2 bytes key Compression Dictionary length
  * 2 bytes value Compression Dictionary length
  * 2 bytes block count
* serialized AQMF
* serialized key Compression Dictionary
* serialized value Compression Dictionary
* foreach block
  * 4 bytes end of block offset relative to start of all blocks
* foreach block
  * 4 bytes uncompressed block length
  * compressed data

#### Index Block

* 1 byte block type (0: index block)
* 2 bytes entry count
* foreach entry (expect first)
  * 2 bytes position in block after header
* Max block size: 64 KB

An Index block contains `n` keys, which specify `n - 1` key ranges (eq key goes into the prev range, except for the first key). Between these `n` keys there are `n - 1` 2 byte block indicies that point to the block that contains the key range.

#### Key Block

* 1 byte block type (1: key block)
* 3 bytes entry count
* foreach entry
  * 1 byte type
  * 3 bytes position in block after header
* Max block size: 16 MB

A Key block contains n keys, which specify n key value pairs. The `i`-th value can be found in `current block index + base block offset + 1` at entry `i`.

Depending on the `type` field entry has a different format:
* 0: normal key (small value)
  * key data
  * 2 byte block index
  * 2 bytes size
  * 4 bytes position in block
* 1: blob reference
  * key data
  * 4 bytes sequence number
* 2: deleted key / thumbstone (no data)
  * key data
* 3: normal key (medium sized value)
  * key data
  * 2 byte block index
* 7: merge key (future)
  * key data
  * 2 byte block index
  * 3 bytes size
  * 4 bytes position in block
* 8..255: inlined key (future)
  * key data
  * type - 8 bytes value data

#### Value Block

* no header, all bytes are data referenced by other blocks
* max block size: 4 GB

### Blob file

The plain value compressed with dynamic compression.

## Reading

Reading start from the current sequence number and goes downwards.

* We have all SST files memory mapped
* for i = CURRENT sequence number .. 0
  * Check AQMF from SST file for key existance -> if not continue
  * let block = 0
  * loop
    * Index Block: find key range that contains the key by binary search
      * found -> set block, continue
      * not found -> break
    * Key Block: find key by binary search
      * found -> lookup value from value block, return
      * not found -> break

## Writing

Writing starts by creating a new WriteBatch. It maintains an atomic counter of the next free sequence number.

The WriteBatch has a thread local buffer that accumulates operations until a certain threshold is reached. Then the buffer is sorted and written to a new SST file (and maybe some blob files).

When the WriteBatch is committed all thread local buffers are merged into a single global buffer and written into new SST files (potentially multiple when threshold is reached).

fsync! The new sequence number is written to the `CURRENT` file.

After that optimization might take place.

## Compaction

* During reading we track cases where too many blocks have been read to find a key. In these cases we found multiple SST files that have overlapping key ranges. We can optimize these.
* We track that by storing an atomic index for every SST file that points to a previous SST file that has overlapping key range.
* During optimization we find chains of SST files that are connected that way and run optimization for them.
* For each chain of SST files
  * Create iterators for every SST file in the chain. The iterator iterates ordered by key.
  * Create a merging iterator (heap).
  * Note: A key might be in multiple SST files, in which case the lastest SST file wins. When one of the other pairs reference a different blob file this is enqueued for deletion.
  * Iterate items and push them into new SST files once the threshold is reached. (We can use the fact that pairs are already ordered by key)
  * Enqueue the old SST files for deletion.
* Store the enqueued deletions into a `<seqnr>.del` file.
  * This is needed for cleanup, in the case the process crashes after the next step.
* fsync! Update the `CURRENT` file.
* Remove enqueued deletions from the list of active SST files.
* Before deleting the old files we need to fsync, but we don't want to do that right now for performance reasons. Instead we delete the files after the next fsync.

## Opening

* Read the `CURRENT` file
* Delete all files with a higher sequence number than the one in the `CURRENT` file.
* Read all `*.del` files and delete the files that are listed in there.
* Read all `*.sst` files and memory map them.

## Closing

* fsync!
* (this also deleted enqueued files)


