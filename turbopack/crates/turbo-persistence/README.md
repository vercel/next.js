# turbo-persistence

This crate provides a way to persist key value pairs into a folder and restore them later.

The API only allows a single write transaction at a time, but multiple threads can fill the transaction with (non-conflicting) data concurrently.

When pushing data into the WriteBatch it is already persisted to disk, but only becomes visible after the transaction is committed. On startup left-over uncommitted files on disk are automatically cleaned up.

The architecture is optimized for pushing a lot data to disk in a single transaction, while still allowing for fast random reads.

It supports having multiple key families, which are stored in separate files, but a write batch can contain keys from multiple families. Each key family defines a separate key space. Entries in different key families doesn't influence each other (also not performance-wise).

## On disk format

There is a single `CURRENT` file which stores the latest committed sequence number.

All other files have a sequence number as file name, e. g. `0000123.sst`. All files are immutable once there sequence number is <= the committed sequence number. But they might be deleted when they are superseeded by other committed files.

There are two different file types:

* Static Sorted Table (SST, `*.sst`): These files contain key value pairs.
* Blob files (`*.blob`): These files contain large values.

Therefore there are there value types:

* INLINE: Small values that are stored directly in the `*.sst` files.
* BLOB: Large values that are stored in `*.blob` files.
* DELETED: Values that are deleted. (Tombstone)
* Future:
  * MERGE: An application specific update operation that is applied on the old value.

### SST file

* Headers
  * 4 bytes magic number and version
  * 4 bytes key family
  * 8 bytes min hash
  * 8 bytes max hash
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
* 2 bytes block index
* `n` times
  * 8 bytes hash
  * 2 bytes block index

An Index block contains `n` 8 bytes hashes, which specify `n - 1` hash ranges (eq hash goes into the prev range, except for the first key). Between these `n` hashes there are `n - 1` 2 byte block indicies that point to the block that contains the hash range.

The hashes are sorted.

`n` is `(block size + 1) / 10`

#### Key Block

* 1 byte block type (1: key block)
* 3 bytes entry count
* foreach entry
  * 1 byte type
  * 3 bytes position in block after header
* Max block size: 16 MB

A Key block contains n keys, which specify n key value pairs.

Depending on the `type` field entry has a different format:
* 0: normal key (small value)
  * 8 bytes key hash
  * key data
  * 2 byte block index
  * 2 bytes size
  * 4 bytes position in block
* 1: blob reference
  * 8 bytes key hash
  * key data
  * 4 bytes sequence number
* 2: deleted key / tombstone (no data)
  * 8 bytes key hash
  * key data
* 3: normal key (medium sized value)
  * 8 bytes key hash
  * key data
  * 2 byte block index
* 7: merge key (future)
  * key data
  * 2 byte block index
  * 3 bytes size
  * 4 bytes position in block
* 8..255: inlined key (future)
  * 8 bytes key hash
  * key data
  * type - 8 bytes value data

The entries are sorted by key hash and key.

TODO: 8 bytes key hash is a bit inefficient for small keys.

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

For compaction we compute the "coverage" of the SST files. The coverage is the average number of SST files that need to be touched to figure out that a key is missing. The coverage can be computed by looking at the min_hash and max_hash of the SST files only.

For a single SST file we can compute `(max_hash - min_hash) / u64::MAX` as the coverage of the SST file. We sum up all these coverages to get the total coverage.

Compaction chooses a few SST files and runs the merge step of merge sort on tham to create a few new SST files with sorted ranges.

Example:

```
key hash range: | 0    ...    u64::MAX |
SST 1:             |----------------|
SST 2:                |----------------|
SST 3:            |-----|
```

can be compacted into:

```
key hash range: | 0    ...    u64::MAX |
SST 1':           |-------|
SST 2':                   |------|
SST 3':                          |-----|
```

The merge operation decreases the total coverage since the new SST files will have a coverage of < 1.

But we need to be careful to insert the SST files in the correct location again, since items in these SST files might be overriden in later SST file and we don't want to change that.

Since SST files that are smaller than the current sequence number are immutable we can't change the files and we can't insert new files at this sequence numbers.
Instead we need to insert the new SST after the current sequence number and copy all SST files after the original SST files after them. (Actually we only need to copy SST files with overlapping key hash ranges. And we can hardlink them instead). Later we will write the current sequence number and delete them original and all copied SST files.

We can run multiple merge operations concurrently when the key hash ranges are not overlapping or they are from different key families. The copy operation need to be strictly after all merge operations.

There must not be another SST file with overlapping key hash range between files of a merge operation.

During the merge operation we eliminate duplicate keys. When blob references are eliminated we delete the blob file after the current sequence number was updated.

Since the process might exit unexpectedly, to avoid "forgetting" to delete the SST files we keep track of that in a `*.del` file. This file contains the sequence number of SST and blob files that should be deleted. We write that file before the current sequence number is updated. On restart we execute the deletes again.

We limit the number of SST files that are merged at once to avoid long compactions.

Full example:

Example:

```
key hash range: | 0    ...    u64::MAX | Family
SST 1:             |-|                   1
SST 2:             |----------------|    1
SST 3:                |----------------| 1
SST 4:            |-----|                2
SST 5:                |-----|            2
SST 6:                 |-------|         1
SST 7:                    |-------|      1
SST 8:                 |--------|        2
SST 9:                     |--------|    2
CURRENT: 9
```

Compactions could selects SST 2, 3, 6 and SST 4, 5, 8 for merging (we limited to 3 SST files per merge operation). This also selects SST 7, 9 for copying. The current sequence number is 9.

We merge SST 2, 3, 6 into new SST files 10, 12, 14 and SST 4, 5, 8 into new SST files 11, 13. Both operations are done concurrently so they might choose free sequence numbers in random order. The operation might result in less SST files due to duplicate keys.

After that we copy SST files 7, 9 to new SST files 15, 16.

We write a "del" file at sequence number 17.

After that we write the new current sequence number 17.

Then we delete SST files 2, 3, 6 and 4, 5, 8 and 7, 9. The

SST files 1 stays unchanged.

```
key hash range: | 0    ...    u64::MAX | Family
SST 1:             |-|                   1
SST 10:            |-----|               1
SST 12:                  |-----|         1
SST 11:            |------|              2
SST 14:                        |-------| 1
SST 13:                   |-----|        2
SST 15:                   |-------|      1
SST 16:                    |--------|    2
DEL 17:  (2, 3, 4, 5, 6, 7, 8, 9)
CURRENT: 17
```

Configuration options for compations are:
* max number of SST files that are merged at once
* coverage when compaction is triggered (otherwise calling compact is a noop)

## Opening

* Read the `CURRENT` file
* Delete all files with a higher sequence number than the one in the `CURRENT` file.
* Read all `*.del` files and delete the files that are listed in there.
* Read all `*.sst` files and memory map them.

## Closing

* fsync!
* (this also deleted enqueued files)


