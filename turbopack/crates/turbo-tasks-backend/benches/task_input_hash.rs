use std::hash::Hash;

use bincode::{
    Encode,
    enc::{EncoderImpl, write::Writer},
    error::EncodeError,
};
use criterion::{BenchmarkGroup, Criterion, measurement::Measurement};
use turbo_rcstr::RcStr;
use turbo_tasks::DynTaskInputs;
use turbo_tasks_hash::{DeterministicHasher, Xxh3Hash64Hasher};

struct HashWriter<'a>(&'a mut Xxh3Hash64Hasher);

impl Writer for HashWriter<'_> {
    fn write(&mut self, bytes: &[u8]) -> Result<(), EncodeError> {
        self.0.write_bytes(bytes);
        Ok(())
    }
}

type HashEncoder<'a> = EncoderImpl<
    HashWriter<'a>,
    bincode::config::Configuration<
        bincode::config::LittleEndian,
        bincode::config::Fixint,
        bincode::config::NoLimit,
    >,
>;

fn bincode_hash<T: Encode>(value: &T) -> u64 {
    let mut hasher = Xxh3Hash64Hasher::new();
    let mut encoder: HashEncoder<'_> = EncoderImpl::new(
        HashWriter(&mut hasher),
        bincode::config::standard().with_fixed_int_encoding(),
    );
    value.encode(&mut encoder).unwrap();
    hasher.finish()
}

fn erased_hash(value: &dyn DynTaskInputs) -> u64 {
    let mut hasher = Xxh3Hash64Hasher::new();
    value.hash_value(&mut hasher);
    hasher.finish()
}

fn concrete_hash<T: Hash>(value: &T) -> u64 {
    let mut hasher = Xxh3Hash64Hasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

fn bench_pair<M, T>(group: &mut BenchmarkGroup<'_, M>, name: &str, value: T)
where
    M: Measurement,
    T: DynTaskInputs + Encode + Hash,
{
    group.bench_function(format!("{name}/bincode"), |b| {
        b.iter(|| bincode_hash(std::hint::black_box(&value)))
    });
    group.bench_function(format!("{name}/hash-erased"), |b| {
        b.iter(|| erased_hash(std::hint::black_box(&value)))
    });
    group.bench_function(format!("{name}/hash-concrete"), |b| {
        b.iter(|| concrete_hash(std::hint::black_box(&value)))
    });
}

#[inline(never)]
fn profile_bincode(value: &RcStr) -> u64 {
    let mut hasher = Xxh3Hash64Hasher::new();
    let mut encoder: HashEncoder<'_> = EncoderImpl::new(
        HashWriter(&mut hasher),
        bincode::config::standard().with_fixed_int_encoding(),
    );
    value.encode(&mut encoder).unwrap();
    hasher.finish()
}

#[inline(never)]
fn profile_erased(value: &RcStr) -> u64 {
    let mut hasher = Xxh3Hash64Hasher::new();
    (value as &dyn DynTaskInputs).hash_value(&mut hasher);
    hasher.finish()
}

#[inline(never)]
fn profile_concrete(value: &RcStr) -> u64 {
    let mut hasher = Xxh3Hash64Hasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

fn profile(mode: &str) {
    let value = RcStr::from("x".repeat(32));
    let hash: fn(&RcStr) -> u64 = match mode {
        "bincode" => profile_bincode,
        "hash-erased" => profile_erased,
        "hash-concrete" => profile_concrete,
        _ => panic!("unknown TURBO_TASK_HASH_PROFILE mode: {mode}"),
    };
    let start = std::time::Instant::now();
    while start.elapsed() < std::time::Duration::from_secs(10) {
        for _ in 0..1000 {
            std::hint::black_box(hash(std::hint::black_box(&value)));
        }
    }
}

pub fn task_input_hash(c: &mut Criterion) {
    if let Ok(mode) = std::env::var("TURBO_TASK_HASH_PROFILE") {
        profile(&mode);
        return;
    }

    let mut group = c.benchmark_group("task-input-hash");

    for len in [0, 8, 32, 128] {
        bench_pair(
            &mut group,
            &format!("rcstr-{len}"),
            RcStr::from("x".repeat(len)),
        );
    }

    bench_pair(
        &mut group,
        "strings",
        (
            RcStr::from("src/app/page.tsx"),
            vec![RcStr::from("client"), RcStr::from("server")],
        ),
    );
    bench_pair(
        &mut group,
        "mixed",
        (
            RcStr::from("src/app/page.tsx"),
            Some(3u32),
            vec![RcStr::from("client"), RcStr::from("server")],
        ),
    );
    bench_pair(
        &mut group,
        "numeric-256",
        (RcStr::from("module"), (0..256).collect::<Vec<u32>>()),
    );

    group.finish();
}
