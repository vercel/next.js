#![feature(once_cell_try)]
#![feature(new_zeroed_alloc)]
#![feature(get_mut_unchecked)]

mod arc_slice;
mod collector;
mod constants;
mod db;
mod entry;
mod static_sorted_file;
mod static_sorted_file_builder;
mod write_batch;

mod key;
#[cfg(test)]
mod tests;

pub use arc_slice::ArcSlice;
pub use db::TurboPersistence;
pub use key::{QueryKey, StoreKey};
pub use write_batch::WriteBatch;
