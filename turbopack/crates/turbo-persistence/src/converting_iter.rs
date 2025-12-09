use anyhow::Result;

use crate::{
    arc_slice::ArcSlice,
    compression::decompress_into_arc,
    db::TurboPersistence,
    lookup_entry::{LazyLookupValue, LookupValue},
    merge_iter::MergeIter,
    parallel_scheduler::ParallelScheduler,
    static_sorted_file::StaticSortedFileIter,
};

/// Owned version of a lookup entry that can be returned from an iterator
#[derive(Clone)]
pub struct OwnedLookupEntry {
    /// The hash of the key.
    pub hash: u64,
    /// The key.
    pub key: ArcSlice<u8>,
    /// The value.
    pub value: ArcSlice<u8>,
}

/// Iterator that converts LookupEntry to OwnedLookupEntry
pub(crate) struct ConvertingIter<'l, S: ParallelScheduler> {
    pub(crate) inner: MergeIter<'l, StaticSortedFileIter<'l>>,
    pub(crate) db: &'l TurboPersistence<S>,
}

impl<'l, S: ParallelScheduler> Iterator for ConvertingIter<'l, S> {
    type Item = Result<OwnedLookupEntry>;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            let lookup_entry = match self.inner.next()? {
                Ok(entry) => entry,
                Err(e) => return Some(Err(e)),
            };

            // Extract the value based on its type
            match &lookup_entry.value {
                LazyLookupValue::Eager(LookupValue::Slice { value }) => {
                    return Some(Ok(OwnedLookupEntry {
                        hash: lookup_entry.hash,
                        key: lookup_entry.key.clone(),
                        value: value.clone(),
                    }));
                }
                LazyLookupValue::Eager(LookupValue::Blob { sequence_number }) => {
                    // Read the blob
                    match self.db.read_blob(*sequence_number) {
                        Ok(blob) => {
                            return Some(Ok(OwnedLookupEntry {
                                hash: lookup_entry.hash,
                                key: lookup_entry.key.clone(),
                                value: blob,
                            }));
                        }
                        Err(e) => {
                            return Some(Err(e));
                        }
                    }
                }
                LazyLookupValue::Eager(LookupValue::Deleted) => {
                    // Skip deleted entries
                    continue;
                }
                LazyLookupValue::Medium {
                    uncompressed_size,
                    block,
                } => {
                    // Decompress the medium value
                    match decompress_into_arc(*uncompressed_size, *block, None, false) {
                        Ok(decompressed) => {
                            return Some(Ok(OwnedLookupEntry {
                                hash: lookup_entry.hash,
                                key: lookup_entry.key.clone(),
                                value: ArcSlice::from(decompressed),
                            }));
                        }
                        Err(e) => {
                            return Some(Err(e));
                        }
                    }
                }
            }
        }
    }
}
