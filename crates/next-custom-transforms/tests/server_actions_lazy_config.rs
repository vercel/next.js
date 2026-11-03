//! Checks that the server actions transform only reads its lazy config values (the hash salt and
//! the cache kinds) for modules that need them.

use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

use next_custom_transforms::transforms::server_actions::{
    self, LazyGet, LazyValue, ServerActionsMode, server_actions,
};
use rustc_hash::FxHashSet;
use swc_core::{
    common::{FileName, Mark},
    ecma::{
        ast::Program,
        transforms::{base::resolver, testing::Tester},
    },
};
use turbo_rcstr::{RcStr, rcstr};

fn transform(
    source: &str,
    hash_salt: LazyValue<RcStr>,
    cache_kinds: LazyValue<FxHashSet<RcStr>>,
) -> String {
    Tester::run(|tester| {
        let mut program = Program::Module(tester.parse_module("/app/item.js", source)?);
        let unresolved_mark = Mark::new();
        program.mutate(resolver(unresolved_mark, Mark::new(), false));
        program.mutate(server_actions(
            &FileName::Real("/app/item.js".into()),
            None,
            server_actions::Config {
                is_react_server_layer: true,
                is_development: false,
                use_cache_enabled: true,
                hash_salt,
                cache_kinds,
            },
            tester.comments.clone(),
            unresolved_mark,
            tester.cm.clone(),
            Default::default(),
            ServerActionsMode::Turbopack,
        ));
        let comments = tester.comments.clone();
        Ok(tester.print(&program, &comments))
    })
}

fn cache_kinds() -> FxHashSet<RcStr> {
    FxHashSet::from_iter([rcstr!("x")])
}

/// A lazy value counting how often it was accessed.
struct Counting<T> {
    value: T,
    reads: Arc<AtomicUsize>,
}

impl<T: Send + Sync> LazyGet<T> for Counting<T> {
    fn get(&self) -> &T {
        self.reads.fetch_add(1, Ordering::Relaxed);
        &self.value
    }
}

fn counting<T: Send + Sync + 'static>(reads: &Arc<AtomicUsize>, value: fn() -> T) -> LazyValue<T> {
    LazyValue::lazy(Arc::new(Counting {
        value: value(),
        reads: reads.clone(),
    }))
}

/// Returns how often `source` accessed a lazy salt, after checking it matches an eager salt.
fn lazy_salt_reads(source: &str) -> usize {
    let reads = Arc::new(AtomicUsize::new(0));
    let lazy = transform(
        source,
        counting(&reads, || rcstr!("salt")),
        cache_kinds().into(),
    );
    assert_eq!(
        lazy,
        transform(source, rcstr!("salt").into(), cache_kinds().into())
    );
    reads.load(Ordering::Relaxed)
}

/// Returns how often `source` accessed lazy cache kinds, after checking they match eager ones.
fn lazy_cache_kinds_reads(source: &str) -> usize {
    let reads = Arc::new(AtomicUsize::new(0));
    let lazy = transform(source, rcstr!("salt").into(), counting(&reads, cache_kinds));
    assert_eq!(
        lazy,
        transform(source, rcstr!("salt").into(), cache_kinds().into())
    );
    reads.load(Ordering::Relaxed)
}

#[test]
fn lazy_salt_is_only_read_for_server_functions() {
    assert_eq!(
        lazy_salt_reads("export default function f() { return 'use server'; }"),
        0
    );
    assert!(
        lazy_salt_reads(
            "export async function f() { 'use server'; } export async function g() { 'use \
             server'; }"
        ) > 0
    );
}

#[test]
fn lazy_cache_kinds_are_only_read_for_custom_cache_kinds() {
    assert_eq!(
        lazy_cache_kinds_reads("export default function f() { return 'use cache: x'; }"),
        0
    );
    assert_eq!(
        lazy_cache_kinds_reads("export async function f() { 'use cache'; }"),
        0
    );
    assert!(
        lazy_cache_kinds_reads(
            "export async function f() { 'use cache: x'; } export async function g() { 'use \
             cache: x'; }"
        ) > 0
    );
}
