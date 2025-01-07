#![feature(iter_intersperse)]
#![feature(hash_raw_entry)]
#![feature(box_patterns)]

use std::{collections::HashSet, hash::BuildHasherDefault, sync::Arc};

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
mod u64_empty_string;
mod u64_string;
mod viewer;

type FxIndexMap<K, V> = indexmap::IndexMap<K, V, BuildHasherDefault<FxHasher>>;

fn main() {
    let args: HashSet<String> = std::env::args().skip(1).collect();

    let mut iter = args.iter();
    let arg = iter.next().expect("missing argument: trace file path");
    let port = iter.next().map_or(5747, |s| s.parse().unwrap());

    let store = Arc::new(StoreContainer::new());
    let reader = TraceReader::spawn(store.clone(), arg.into());

    serve(store, port);

    reader.join().unwrap();
}
