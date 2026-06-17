//! Asserts that the Rust React compiler transform fires on the
//! `source_maps/react-compiler` snapshot fixture: output must
//! contain memoized cache slots, not the original un-compiled form.

#![cfg(test)]

use std::{fs, path::Path};

fn fixture_output_dir() -> std::path::PathBuf {
    Path::new(env!("TURBO_PNPM_WORKSPACE_DIR"))
        .join("turbopack/crates/turbopack-tests/tests/snapshot/source_maps/react-compiler/output")
}

/// Find the JS chunk that contains the compiled Component.jsx content.
fn find_component_chunk() -> String {
    let dir = fixture_output_dir();
    assert!(
        dir.exists(),
        "output directory not found — run `UPDATE=1 cargo test -p turbopack-tests --test snapshot \
         -- source_maps__react_compiler` to generate it"
    );
    for entry in fs::read_dir(&dir).expect("failed to read output dir") {
        let path = entry.unwrap().path();
        if path.extension().and_then(|e| e.to_str()) != Some("js") {
            continue;
        }
        let content = fs::read_to_string(&path).expect("failed to read chunk");
        if content.contains("Component.jsx") {
            return content;
        }
    }
    panic!("no chunk containing Component.jsx found in {dir:?}");
}

#[test]
fn react_compiler_inserts_memo_cache() {
    let chunk = find_component_chunk();
    assert!(
        chunk.contains("compiler-runtime") && chunk.contains("[\"c\"]"),
        "expected the React compiler runtime cache helper (`c` from `react/compiler-runtime`) in \
         compiled output — React compiler may not have run"
    );
}

#[test]
fn react_compiler_inserts_cache_slots() {
    let chunk = find_component_chunk();
    assert!(
        chunk.contains("$[0]"),
        "expected cache slot reads (`$[0]`) — React compiler may not have run"
    );
}

#[test]
fn react_compiler_gates_jsx_on_cache_slots() {
    let chunk = find_component_chunk();
    assert!(
        chunk.contains("$[0] !==") || chunk.contains("$[1] !=="),
        "expected cache-invalidation gate (`$[N] !== dep`) — memoization may not have been \
         applied to JSX output"
    );
}
