use criterion::{Criterion, black_box, criterion_group, criterion_main};
use next_code_frame::{
    CodeFrameColorMode, CodeFrameLocation, CodeFrameOptions, Language, Location, render_code_frame,
};

/// Generate a realistic small TypeScript/React file (~300 lines).
fn generate_small_file() -> String {
    let mut lines = Vec::with_capacity(300);

    lines.push("import React, { useState, useEffect, useCallback, useMemo } from 'react'");
    lines.push("import { useRouter } from 'next/router'");
    lines.push("import Link from 'next/link'");
    lines.push("");
    lines.push("interface User {");
    lines.push("  id: string");
    lines.push("  name: string");
    lines.push("  email: string");
    lines.push("  avatar?: string");
    lines.push("  role: 'admin' | 'user' | 'moderator'");
    lines.push("  createdAt: Date");
    lines.push("}");
    lines.push("");

    // Pad with realistic component code
    for i in 0..40 {
        lines.push("function ComponentPart() {");
        // Use a leaked string so we get &'static str
        let s: &'static str =
            Box::leak(format!("  const [state{i}, setState{i}] = useState(null)").into_boxed_str());
        lines.push(s);
        lines.push("  useEffect(() => {");
        let s: &'static str = Box::leak(
            format!("    fetch('/api/data/{i}').then(r => r.json()).then(setState{i})")
                .into_boxed_str(),
        );
        lines.push(s);
        lines.push("  }, [])");
        lines.push("  return (");
        lines.push("    <div className=\"flex items-center justify-center p-4\">");
        let s: &'static str =
            Box::leak(format!("      <span>{{state{i}?.name}}</span>").into_boxed_str());
        lines.push(s);
        lines.push("    </div>");
        lines.push("  )");
        lines.push("}");
        lines.push("");
    }

    lines.join("\n")
}

/// Generate a large bundled JS file (~30k lines) mimicking react-dom.development.js.
fn generate_large_file(minified: bool) -> String {
    let mut lines = Vec::with_capacity(30_000);

    lines.push("/**");
    lines.push(" * @license React");
    lines.push(" * react-dom.development.js");
    lines.push(" *");
    lines.push(" * Copyright (c) Meta Platforms, Inc. and affiliates.");
    lines.push(" */");
    lines.push("'use strict';");
    lines.push("");
    lines.push("(function (global, factory) {");
    lines.push(
        "  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, \
         require('react')) :",
    );
    lines.push(
        "  typeof define === 'function' && define.amd ? define(['exports', 'react'], factory) :",
    );
    lines.push("  (global = global || self, factory(global.ReactDOM = {}, global.React));");
    lines.push("}(this, (function (exports, React) { 'use strict';");
    lines.push("");

    // Generate ~30k lines of realistic bundled code
    for i in 0..3000 {
        lines.push(
            "function reconcileChildFibers(returnFiber, currentFirstChild, newChild, lanes) {",
        );
        // Leaked strings for &'static str
        let s: &'static str = Box::leak(
            format!(
                "  var isUnkeyedTopLevelFragment = typeof newChild === 'object' && newChild !== \
                 null && newChild.type === REACT_FRAGMENT_TYPE_{i} && newChild.key === null;"
            )
            .into_boxed_str(),
        );
        lines.push(s);
        lines.push("  if (isUnkeyedTopLevelFragment) {");
        lines.push("    newChild = newChild.props.children;");
        lines.push("  }");
        lines.push("  if (typeof newChild === 'object' && newChild !== null) {");
        lines.push("    switch (newChild.$$typeof) {");
        lines.push("      case REACT_ELEMENT_TYPE:");
        lines.push(
            "        return placeSingleChild(reconcileSingleElement(returnFiber, \
             currentFirstChild, newChild, lanes));",
        );
        lines.push("    }");
        lines.push("  }");
        lines.push("}");
        lines.push("");
    }

    lines.push("})));");
    lines.join(if minified { " " } else { "\n" })
}

fn bench_small_file(c: &mut Criterion) {
    let source = generate_small_file();
    let line_count = source.lines().count();
    let mid = line_count / 2;

    let location = CodeFrameLocation {
        start: Location {
            line: mid,
            column: Some(10),
        },
        end: None,
    };

    let options = CodeFrameOptions {
        highlight_code: true,
        color: CodeFrameColorMode::Error,
        max_width: 100,
        language: Language::JavaScript,
        ..Default::default()
    };

    c.bench_function(&format!("rust: small file ({line_count} lines)"), |b| {
        b.iter(|| {
            let result = render_code_frame(black_box(&source), black_box(&location), &options);
            black_box(result).unwrap();
        });
    });
}

fn bench_large_file(c: &mut Criterion) {
    let source = generate_large_file(false);
    let line_count = source.lines().count();
    let mid = line_count / 2;

    let location = CodeFrameLocation {
        start: Location {
            line: mid,
            column: Some(10),
        },
        end: None,
    };

    let options = CodeFrameOptions {
        highlight_code: true,
        color: CodeFrameColorMode::Error,
        max_width: 100,
        language: Language::JavaScript,
        ..Default::default()
    };

    c.bench_function(&format!("rust: large file ({line_count} lines)"), |b| {
        b.iter(|| {
            let result = render_code_frame(black_box(&source), black_box(&location), &options);
            black_box(result).unwrap();
        });
    });
}

fn bench_minified_file(c: &mut Criterion) {
    // Take the large file and collapse lines by stripping whitespace after `;`
    // to simulate a minified bundle with very long lines.
    let source = generate_large_file(true);
    let line_count = source.lines().count();
    // Point at a column somewhere in the middle of the long line
    let mid_col = source.lines().next().map_or(100, |l| l.len() / 2);

    let location = CodeFrameLocation {
        start: Location {
            line: 1,
            column: Some(mid_col),
        },
        end: None,
    };

    let options = CodeFrameOptions {
        highlight_code: true,
        color: CodeFrameColorMode::Error,
        max_width: 100,
        language: Language::JavaScript,
        ..Default::default()
    };

    c.bench_function(
        &format!("rust: minified file ({line_count} lines, ~{mid_col} col)"),
        |b| {
            b.iter(|| {
                let result = render_code_frame(black_box(&source), black_box(&location), &options);
                black_box(result).unwrap();
            });
        },
    );
}

criterion_group!(
    benches,
    bench_small_file,
    bench_large_file,
    bench_minified_file
);
criterion_main!(benches);
