//! Measures the cost of the raw allocation paths through [`TurboMalloc`], including its
//! thread-local allocation accounting. Useful when changing the allocator's instrumentation, since
//! that code runs on every allocation and deallocation in Turbopack.

use std::alloc::{Layout, alloc, dealloc, realloc};

use criterion::{Criterion, black_box, criterion_group, criterion_main};

#[global_allocator]
static ALLOC: turbo_tasks_malloc::TurboMalloc = turbo_tasks_malloc::TurboMalloc;

const ALIGN: usize = 8;
const SIZE: usize = 64;
const LARGER_SIZE: usize = 128;

fn make_layout(size: usize) -> Layout {
    Layout::from_size_align(size, ALIGN).expect("valid layout")
}

fn benchmark(c: &mut Criterion) {
    let mut group = c.benchmark_group("turbo_malloc");

    group.bench_function("alloc_dealloc", |b| {
        b.iter(|| {
            // `black_box` the size so the allocation can't be optimized away or folded.
            let layout = make_layout(black_box(SIZE));
            // SAFETY: the layout has a non-zero size, and the pointer is freed with the same
            // layout it was allocated with.
            unsafe {
                let ptr = alloc(layout);
                assert!(!ptr.is_null(), "allocation failed");
                dealloc(black_box(ptr), layout);
            }
        });
    });

    group.bench_function("alloc_realloc_dealloc", |b| {
        b.iter(|| {
            let layout = make_layout(black_box(SIZE));
            let new_size = black_box(LARGER_SIZE);
            // SAFETY: `ptr` is allocated with `layout`, reallocated to `new_size` with the same
            // alignment, and finally freed with the layout it then has.
            unsafe {
                let ptr = alloc(layout);
                assert!(!ptr.is_null(), "allocation failed");
                let ptr = realloc(ptr, layout, new_size);
                assert!(!ptr.is_null(), "reallocation failed");
                dealloc(black_box(ptr), make_layout(new_size));
            }
        });
    });

    group.finish();
}

criterion_group!(benches, benchmark);
criterion_main!(benches);
