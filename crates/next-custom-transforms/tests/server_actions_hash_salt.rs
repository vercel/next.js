//! Checks that the server actions transform only reads a lazy hash salt for modules with server
//! functions.

use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

use next_custom_transforms::transforms::server_actions::{
    self, HashSalt, ServerActionsMode, server_actions,
};
use swc_core::{
    common::{FileName, Mark},
    ecma::{
        ast::Program,
        transforms::{base::resolver, testing::Tester},
    },
};
use turbo_rcstr::rcstr;

fn transform(source: &str, hash_salt: HashSalt) -> String {
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
                cache_kinds: Default::default(),
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

/// Returns how often `source` read a lazy salt, after checking it matches an eager salt.
fn lazy_salt_reads(source: &str) -> usize {
    let reads = Arc::new(AtomicUsize::new(0));
    let lazy = transform(source, {
        let reads = reads.clone();
        HashSalt::lazy(move || {
            reads.fetch_add(1, Ordering::Relaxed);
            rcstr!("salt")
        })
    });
    assert_eq!(lazy, transform(source, "salt".into()));
    reads.load(Ordering::Relaxed)
}

#[test]
fn lazy_salt_is_only_read_for_server_functions() {
    assert_eq!(
        lazy_salt_reads("export default function f() { return 'use server'; }"),
        0
    );
    assert!(lazy_salt_reads("export async function f() { 'use server'; }") > 0);
}
