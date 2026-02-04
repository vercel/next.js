#![feature(iter_intersperse)]
#![feature(box_patterns)]
#![feature(bufreader_peek)]

use std::{hash::BuildHasherDefault, sync::Arc};

use indexmap::{IndexMap, IndexSet};
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

type FxIndexSet<T> = IndexSet<T, BuildHasherDefault<FxHasher>>;
type FxIndexMap<K, V> = IndexMap<K, V, BuildHasherDefault<FxHasher>>;

fn main() {
    let args: FxIndexSet<String> = std::env::args().skip(1).collect();

    let mut iter = args.iter();
    let arg = iter
        .next()
        .expect("missing positional argument for the trace file path");
    let port = iter.next().map_or(5747, |s| s.parse().unwrap());

    let store = Arc::new(StoreContainer::new());
    let reader = TraceReader::spawn(store.clone(), arg.into());

    serve(store, port);

    reader.join().unwrap();
}
