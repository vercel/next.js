use anyhow::Result;

use crate::converting_iter::OwnedLookupEntry;

/// Iterator that deduplicates consecutive entries with the same key.
/// Since the input iterator is sorted by (hash, key), we only need to compare consecutive entries.
pub struct DedupeIter<T: Iterator<Item = Result<OwnedLookupEntry>>> {
    iter: T,
    current: Option<OwnedLookupEntry>,
}

impl<T: Iterator<Item = Result<OwnedLookupEntry>>> DedupeIter<T> {
    pub fn new(iter: T) -> Self {
        Self {
            iter,
            current: None,
        }
    }
}

impl<T: Iterator<Item = Result<OwnedLookupEntry>>> Iterator for DedupeIter<T> {
    type Item = Result<OwnedLookupEntry>;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            // Get the next entry from the underlying iterator
            match self.iter.next() {
                Some(Ok(next_entry)) => {
                    // Check if we have a current entry
                    match &self.current {
                        Some(current_entry) => {
                            // Compare keys (hash and key bytes)
                            if current_entry.hash == next_entry.hash
                                && current_entry.key.as_ref() == next_entry.key.as_ref()
                            {
                                // Same key - update current with the new value (keep latest)
                                self.current = Some(next_entry);
                                continue;
                            } else {
                                // Different key - return the current entry and store the new one
                                let to_return = self.current.replace(next_entry);
                                return to_return.map(Ok);
                            }
                        }
                        None => {
                            // No current entry - store this one and continue
                            self.current = Some(next_entry);
                        }
                    }
                }
                Some(Err(e)) => {
                    // Pass through errors
                    return Some(Err(e));
                }
                None => {
                    // Iterator exhausted - return the last current entry if any
                    return self.current.take().map(Ok);
                }
            }
        }
    }
}
