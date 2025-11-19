#![feature(iter_intersperse)]
#![feature(box_patterns)]
#![feature(bufreader_peek)]

use std::{hash::BuildHasherDefault, path::PathBuf, sync::Arc};

use rustc_hash::FxHasher;

use self::{reader::TraceReader, server::serve, store_container::StoreContainer};

mod bottom_up;
mod reader;
mod self_time_tree;
mod server;
mod span;
mod span_bottom_up_ref;
mod span_graph_ref;
mod span_ref;
mod store;
mod store_container;
mod string_tuple_ref;
mod timestamp;
mod u64_empty_string;
mod u64_string;
mod viewer;

#[allow(
    dead_code,
    reason = "It's actually used, not sure why it is marked as dead code"
)]
type FxIndexMap<K, V> = indexmap::IndexMap<K, V, BuildHasherDefault<FxHasher>>;

pub fn start_turbopack_trace_server(path: PathBuf, port: Option<u16>) {
    let store = Arc::new(StoreContainer::new());
    let reader = TraceReader::spawn(store.clone(), path);

    serve(store, port.unwrap_or(5747));

    reader.join().unwrap();
}
