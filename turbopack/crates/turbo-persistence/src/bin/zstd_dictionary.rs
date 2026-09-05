//! Train and evaluate zstd dictionaries from logical values in persistence caches.

use std::{
    collections::{BTreeSet, HashSet, VecDeque},
    fs::{self, File, OpenOptions},
    io::{BufWriter, Write},
    path::{Path, PathBuf},
    sync::Arc,
    time::Instant,
};

use anyhow::{Context, Result, ensure};
use clap::{Args, Parser, Subcommand};
use serde::Serialize;
use turbo_persistence::{
    Compression, IterValue, MAX_INLINE_VALUE_SIZE, StaticSortedFileIter, StaticSortedFileMetaData,
    offline::{SstInfo, collect_sst_info, decode_medium, read_blob},
};
use xxhash_rust::xxh3::xxh3_64;

const SCHEMA_VERSION: u32 = 2;
const DICTIONARY_SIZE: usize = 64 * 1024;
const SAMPLE_BUDGET_MULTIPLIER: usize = 1000;
const SAMPLE_BYTE_BUDGET: usize = DICTIONARY_SIZE * SAMPLE_BUDGET_MULTIPLIER;
const BLOB_HEADER_SIZE: usize = 8;

#[derive(Parser)]
#[command(about = "Train and evaluate zstd dictionaries from persistence caches")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Train a 64 KiB zstd dictionary from logical values.
    Train {
        #[command(flatten)]
        source: Source,
        /// Dictionary output path. Existing files are replaced.
        #[arg(short, long)]
        output: PathBuf,
        /// Optional JSON training report.
        #[arg(long)]
        json: Option<PathBuf>,
    },
    /// Compare dictionaries with zstd level 3 without a dictionary.
    Evaluate {
        #[command(flatten)]
        source: Source,
        /// Candidate dictionary. May be supplied more than once.
        #[arg(short, long)]
        dictionary: Vec<PathBuf>,
        /// Optional JSON evaluation report.
        #[arg(long)]
        json: Option<PathBuf>,
    },
}

#[derive(Args)]
struct Source {
    /// Persistence family ID to inspect.
    #[arg(long)]
    family: u32,
    /// Database directories containing CURRENT, meta, SST, and blob files.
    #[arg(required = true)]
    caches: Vec<PathBuf>,
}

#[derive(Clone, Serialize)]
struct DictionaryInfo {
    name: String,
    path: Option<PathBuf>,
    bytes: usize,
    dictionary_id: Option<u32>,
    xxh3_64: Option<String>,
}

struct Candidate {
    info: DictionaryInfo,
    compressor: zstd::bulk::Compressor<'static>,
    decompressor: zstd::bulk::Decompressor<'static>,
    setup_ns: u64,
}

#[derive(Clone, Copy)]
enum SampleKind {
    Slice,
    Medium,
    Blob,
}

struct Sample {
    kind: SampleKind,
    data: Arc<[u8]>,
}

#[derive(Default, Clone, Serialize)]
struct Metric {
    count: u64,
    bytes: u64,
}

impl Metric {
    fn add(&mut self, bytes: usize) {
        self.count += 1;
        self.bytes += bytes as u64;
    }

    fn merge(&mut self, other: &Self) {
        self.count += other.count;
        self.bytes += other.bytes;
    }
}

#[derive(Default, Clone, Serialize)]
struct KindMetrics {
    slice: Metric,
    medium: Metric,
    blob: Metric,
}

impl KindMetrics {
    fn get_mut(&mut self, kind: SampleKind) -> &mut Metric {
        match kind {
            SampleKind::Slice => &mut self.slice,
            SampleKind::Medium => &mut self.medium,
            SampleKind::Blob => &mut self.blob,
        }
    }

    fn merge(&mut self, other: &Self) {
        self.slice.merge(&other.slice);
        self.medium.merge(&other.medium);
        self.blob.merge(&other.blob);
    }

    fn total(&self) -> Metric {
        Metric {
            count: self.slice.count + self.medium.count + self.blob.count,
            bytes: self.slice.bytes + self.medium.bytes + self.blob.bytes,
        }
    }
}

#[derive(Default, Clone, Serialize)]
struct CompressionMetric {
    input_bytes: u64,
    raw_compressed_bytes: u64,
    estimated_stored_bytes: u64,
    raw_compression_ratio: Option<f64>,
    encode_ns: u64,
    decode_ns: u64,
}

impl CompressionMetric {
    fn merge(&mut self, other: &Self) {
        self.input_bytes += other.input_bytes;
        self.raw_compressed_bytes += other.raw_compressed_bytes;
        self.estimated_stored_bytes += other.estimated_stored_bytes;
        self.encode_ns += other.encode_ns;
        self.decode_ns += other.decode_ns;
    }

    fn finalize(&mut self) {
        self.raw_compression_ratio = (self.input_bytes > 0)
            .then(|| self.raw_compressed_bytes as f64 / self.input_bytes as f64);
    }
}

#[derive(Default, Clone, Serialize)]
struct CompressionByKind {
    slice: CompressionMetric,
    medium: CompressionMetric,
    blob: CompressionMetric,
}

impl CompressionByKind {
    fn get_mut(&mut self, kind: SampleKind) -> &mut CompressionMetric {
        match kind {
            SampleKind::Slice => &mut self.slice,
            SampleKind::Medium => &mut self.medium,
            SampleKind::Blob => &mut self.blob,
        }
    }

    fn merge(&mut self, other: &Self) {
        self.slice.merge(&other.slice);
        self.medium.merge(&other.medium);
        self.blob.merge(&other.blob);
    }

    fn finalize(&mut self) {
        self.slice.finalize();
        self.medium.finalize();
        self.blob.finalize();
    }

    fn total(&self) -> CompressionMetric {
        let mut total = CompressionMetric::default();
        total.merge(&self.slice);
        total.merge(&self.medium);
        total.merge(&self.blob);
        total.finalize();
        total
    }
}

#[derive(Clone, Serialize)]
struct CandidateResult {
    dictionary: DictionaryInfo,
    by_kind: CompressionByKind,
    combined: CompressionMetric,
    setup_ns: u64,
}

#[derive(Serialize)]
struct CacheReport {
    path: PathBuf,
    family: u32,
    active_ssts: u64,
    samples: KindMetrics,
    duplicate_blob_references: u64,
    candidates: Vec<CandidateResult>,
}

#[derive(Serialize)]
struct EvaluationReport {
    schema_version: u32,
    family: u32,
    timing_note: &'static str,
    threshold_note: &'static str,
    caches: Vec<CacheReport>,
    combined_samples: KindMetrics,
    combined_candidates: Vec<CandidateResult>,
}

#[derive(Serialize)]
struct TrainingCacheReport {
    path: PathBuf,
    samples: KindMetrics,
}

#[derive(Serialize)]
struct TrainingReport {
    schema_version: u32,
    family: u32,
    zstd_version: &'static str,
    dictionary_size: usize,
    sample_byte_target: usize,
    selected: KindMetrics,
    selected_bytes: u64,
    inputs_exhausted: bool,
    caches: Vec<TrainingCacheReport>,
    dictionary: DictionaryInfo,
}

struct CacheSampleIter {
    path: PathBuf,
    pending: VecDeque<SstInfo>,
    current: Option<StaticSortedFileIter>,
    seen_blobs: HashSet<u32>,
    active_ssts: u64,
    duplicate_blob_references: u64,
}

impl CacheSampleIter {
    fn open(path: PathBuf, family: u32) -> Result<Self> {
        let mut families = collect_sst_info(&path)
            .with_context(|| format!("Failed to inspect cache {}", path.display()))?;
        let mut ssts = families.remove(&family).with_context(|| {
            format!(
                "Cache {} has no active SSTs for family {family}",
                path.display()
            )
        })?;
        for sst in &ssts {
            ensure!(
                sst.compression == Compression::Zstd3,
                "Cache {} family {family} SST {:08}.sst uses {:?}; zstd_dictionary requires Zstd3",
                path.display(),
                sst.sequence_number,
                sst.compression
            );
        }
        // A stable SST order makes repeated runs against one unchanged cache snapshot comparable.
        ssts.sort_by_key(|sst| sst.sequence_number);
        Ok(Self {
            path,
            active_ssts: ssts.len() as u64,
            pending: ssts.into(),
            current: None,
            seen_blobs: HashSet::new(),
            duplicate_blob_references: 0,
        })
    }

    fn open_next_sst(&mut self) -> Result<bool> {
        let Some(sst) = self.pending.pop_front() else {
            return Ok(false);
        };
        self.current = Some(
            StaticSortedFileIter::open(
                &self.path,
                StaticSortedFileMetaData {
                    sequence_number: sst.sequence_number,
                    block_count: sst.block_count,
                },
                Compression::Zstd3,
            )
            .with_context(|| format!("Failed to open {:08}.sst", sst.sequence_number))?,
        );
        Ok(true)
    }

    fn next_sample(&mut self) -> Result<Option<Sample>> {
        loop {
            if self.current.is_none() && !self.open_next_sst()? {
                return Ok(None);
            }
            let entry = match self.current.as_mut().unwrap().next() {
                Some(entry) => entry?,
                None => {
                    self.current = None;
                    continue;
                }
            };
            if let Some(sample) = self.sample_from_value(entry.value)? {
                return Ok(Some(sample));
            }
        }
    }

    fn sample_from_value(&mut self, value: IterValue) -> Result<Option<Sample>> {
        match value {
            IterValue::Slice { value } if value.len() > MAX_INLINE_VALUE_SIZE => Ok(Some(Sample {
                kind: SampleKind::Slice,
                data: Arc::from(value.as_ref()),
            })),
            IterValue::Medium {
                uncompressed_size,
                checksum,
                block,
            } => {
                let value = decode_medium(Compression::Zstd3, uncompressed_size, checksum, &block)
                    .with_context(|| {
                        format!("Failed to read medium value in {}", self.path.display())
                    })?;
                Ok(Some(Sample {
                    kind: SampleKind::Medium,
                    data: value,
                }))
            }
            IterValue::Blob { sequence_number } => {
                if !self.seen_blobs.insert(sequence_number) {
                    self.duplicate_blob_references += 1;
                    return Ok(None);
                }
                let value = read_blob(&self.path, sequence_number, Compression::Zstd3)?;
                Ok(Some(Sample {
                    kind: SampleKind::Blob,
                    data: value,
                }))
            }
            // Inline values live in key blocks and are not independently compressed.
            IterValue::KeyDeleted | IterValue::KeyValueDeleted { .. } | IterValue::Slice { .. } => {
                Ok(None)
            }
        }
    }
}

fn dictionary_info(
    path: Option<&Path>,
    dictionary: &[u8],
    baseline: bool,
) -> Result<DictionaryInfo> {
    let name = if baseline {
        "zstd3 (no dictionary)".to_owned()
    } else {
        path.and_then(Path::file_name)
            .context("Dictionary path has no filename")?
            .to_str()
            .context("Dictionary filename must be UTF-8")?
            .to_owned()
    };
    Ok(DictionaryInfo {
        name,
        path: path.map(Path::to_path_buf),
        bytes: dictionary.len(),
        dictionary_id: zstd::zstd_safe::get_dict_id_from_dict(dictionary).map(|id| id.get()),
        xxh3_64: (!baseline).then(|| format!("{:016x}", xxh3_64(dictionary))),
    })
}

fn make_candidates(paths: &[PathBuf]) -> Result<Vec<Candidate>> {
    let mut result = Vec::with_capacity(paths.len() + 1);
    let started = Instant::now();
    result.push(Candidate {
        info: dictionary_info(None, &[], true)?,
        compressor: zstd::bulk::Compressor::new(3)?,
        decompressor: zstd::bulk::Decompressor::new()?,
        setup_ns: started.elapsed().as_nanos() as u64,
    });
    let mut names = BTreeSet::new();
    for path in paths {
        let dictionary = fs::read(path)
            .with_context(|| format!("Failed to read dictionary {}", path.display()))?;
        ensure!(
            !dictionary.is_empty(),
            "Dictionary {} is empty",
            path.display()
        );
        let info = dictionary_info(Some(path), &dictionary, false)?;
        ensure!(
            names.insert(info.name.clone()),
            "Duplicate dictionary name {}",
            info.name
        );
        let started = Instant::now();
        result.push(Candidate {
            info,
            compressor: zstd::bulk::Compressor::with_dictionary(3, &dictionary)?,
            decompressor: zstd::bulk::Decompressor::with_dictionary(&dictionary)?,
            setup_ns: started.elapsed().as_nanos() as u64,
        });
    }
    Ok(result)
}

/// Evaluates all dictionary candidates against one logical value.
fn evaluate_sample(
    sample: &Sample,
    candidates: &mut [Candidate],
    results: &mut [CandidateResult],
) -> Result<()> {
    for (candidate, result) in candidates.iter_mut().zip(results) {
        let started = Instant::now();
        let compressed = candidate
            .compressor
            .compress(&sample.data)
            .with_context(|| format!("Failed to compress with {}", candidate.info.name))?;
        let encode_ns = started.elapsed().as_nanos() as u64;
        let started = Instant::now();
        let decompressed = candidate
            .decompressor
            .decompress(&compressed, sample.data.len())
            .with_context(|| format!("Failed to decompress with {}", candidate.info.name))?;
        let decode_ns = started.elapsed().as_nanos() as u64;
        ensure!(
            decompressed.as_slice() == sample.data.as_ref(),
            "Round-trip mismatch with {}",
            candidate.info.name
        );

        let metric = result.by_kind.get_mut(sample.kind);
        metric.input_bytes += sample.data.len() as u64;
        metric.raw_compressed_bytes += compressed.len() as u64;
        metric.encode_ns += encode_ns;
        metric.decode_ns += decode_ns;
        metric.estimated_stored_bytes += if matches!(sample.kind, SampleKind::Blob) {
            (compressed.len() + BLOB_HEADER_SIZE) as u64
        } else {
            estimated_value_bytes(sample.data.len(), compressed.len()) as u64
        };
    }
    Ok(())
}

/// Applies the writer's 12.5% minimum-savings rule as a per-value estimate.
///
/// Small values are grouped into physical blocks in production, so this is a comparative proxy,
/// not exact SST-size modeling. See `write_block_to_file` for the production block-level rule.
fn estimated_value_bytes(original_len: usize, compressed_len: usize) -> usize {
    if compressed_len < original_len - original_len / 8 {
        compressed_len
    } else {
        original_len
    }
}

fn empty_results(candidates: &[Candidate]) -> Vec<CandidateResult> {
    candidates
        .iter()
        .map(|candidate| CandidateResult {
            dictionary: candidate.info.clone(),
            by_kind: CompressionByKind::default(),
            combined: CompressionMetric::default(),
            setup_ns: candidate.setup_ns,
        })
        .collect()
}

fn finalize_results(results: &mut [CandidateResult]) {
    for result in results {
        result.by_kind.finalize();
        result.combined = result.by_kind.total();
    }
}

fn evaluate_cache(path: &Path, family: u32, candidates: &mut [Candidate]) -> Result<CacheReport> {
    let mut iter = CacheSampleIter::open(path.to_path_buf(), family)?;
    let mut samples = KindMetrics::default();
    let mut results = empty_results(candidates);
    while let Some(sample) = iter.next_sample()? {
        samples.get_mut(sample.kind).add(sample.data.len());
        evaluate_sample(&sample, candidates, &mut results)?;
    }
    finalize_results(&mut results);
    Ok(CacheReport {
        path: path.to_path_buf(),
        family,
        active_ssts: iter.active_ssts,
        samples,
        duplicate_blob_references: iter.duplicate_blob_references,
        candidates: results,
    })
}

fn combine_evaluation(
    family: u32,
    caches: Vec<CacheReport>,
    candidates: &[Candidate],
) -> EvaluationReport {
    let mut combined_samples = KindMetrics::default();
    let mut combined_candidates = empty_results(candidates);
    for cache in &caches {
        combined_samples.merge(&cache.samples);
        for (combined, current) in combined_candidates.iter_mut().zip(&cache.candidates) {
            combined.by_kind.merge(&current.by_kind);
        }
    }
    finalize_results(&mut combined_candidates);
    EvaluationReport {
        schema_version: SCHEMA_VERSION,
        family,
        timing_note: "Single-pass wall-clock diagnostics; byte/count fields are the comparison \
                      contract.",
        threshold_note: "Slice/medium stored bytes apply the 12.5% rule per logical value and are \
                         a proxy for grouped small-value blocks. Blob bytes include the fixed \
                         8-byte header.",
        caches,
        combined_samples,
        combined_candidates,
    }
}

struct TrainingSelection {
    samples: Vec<Box<[u8]>>,
    caches: Vec<TrainingCacheReport>,
    inputs_exhausted: bool,
    #[cfg(test)]
    selected_cache_indices: Vec<usize>,
}

fn select_training_samples(
    paths: &[PathBuf],
    family: u32,
    byte_budget: usize,
) -> Result<TrainingSelection> {
    let mut paths = paths.to_vec();
    paths.sort();
    let mut iterators = paths
        .into_iter()
        .map(|path| CacheSampleIter::open(path, family))
        .collect::<Result<Vec<_>>>()?;
    let mut per_cache = iterators
        .iter()
        .map(|iter| TrainingCacheReport {
            path: iter.path.clone(),
            samples: KindMetrics::default(),
        })
        .collect::<Vec<_>>();
    let mut samples = Vec::new();
    let mut selected_bytes = 0_usize;
    let mut active = vec![true; iterators.len()];
    let mut active_count = iterators.len();
    #[cfg(test)]
    let mut selected_cache_indices = Vec::new();

    while active_count > 0 && selected_bytes < byte_budget {
        for index in 0..iterators.len() {
            if !active[index] {
                continue;
            }
            match iterators[index].next_sample()? {
                Some(sample) => {
                    selected_bytes += sample.data.len();
                    per_cache[index]
                        .samples
                        .get_mut(sample.kind)
                        .add(sample.data.len());
                    samples.push(Box::from(sample.data.as_ref()));
                    #[cfg(test)]
                    selected_cache_indices.push(index);
                    if selected_bytes >= byte_budget {
                        break;
                    }
                }
                None => {
                    active[index] = false;
                    active_count -= 1;
                }
            }
        }
    }
    Ok(TrainingSelection {
        samples,
        caches: per_cache,
        inputs_exhausted: active_count == 0,
        #[cfg(test)]
        selected_cache_indices,
    })
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent).with_context(|| format!("Failed to create {}", parent.display()))?;
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .context("Output filename must be UTF-8")?;
    let temporary = parent.join(format!(".{filename}.{}.tmp", std::process::id()));
    let result = (|| -> Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        fs::rename(&temporary, path).with_context(|| {
            format!(
                "Failed to replace {} with {}",
                path.display(),
                temporary.display()
            )
        })?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn train(source: &Source, output: &Path) -> Result<TrainingReport> {
    let TrainingSelection {
        samples,
        caches,
        inputs_exhausted,
        ..
    } = select_training_samples(&source.caches, source.family, SAMPLE_BYTE_BUDGET)?;
    ensure!(!samples.is_empty(), "No eligible values found for training");
    let selected = caches
        .iter()
        .fold(KindMetrics::default(), |mut total, cache| {
            total.merge(&cache.samples);
            total
        });
    let selected_bytes = selected.total().bytes;
    let dictionary = zstd::dict::from_samples(&samples, DICTIONARY_SIZE).with_context(|| {
        format!(
            "Failed to train a {DICTIONARY_SIZE}-byte dictionary from {} values ({selected_bytes} \
             bytes)",
            samples.len()
        )
    })?;
    write_atomic(output, &dictionary)?;
    Ok(TrainingReport {
        schema_version: SCHEMA_VERSION,
        family: source.family,
        zstd_version: zstd::zstd_safe::version_string(),
        dictionary_size: DICTIONARY_SIZE,
        sample_byte_target: SAMPLE_BYTE_BUDGET,
        selected,
        selected_bytes,
        inputs_exhausted,
        caches,
        dictionary: dictionary_info(Some(output), &dictionary, false)?,
    })
}

fn print_training(report: &TrainingReport) {
    println!(
        "Trained {} ({} bytes, id {:?}, xxh3 {}) from {} values / {} bytes (target {}, exhausted: \
         {})",
        report.dictionary.path.as_ref().unwrap().display(),
        report.dictionary.bytes,
        report.dictionary.dictionary_id,
        report.dictionary.xxh3_64.as_deref().unwrap_or("none"),
        report.selected.total().count,
        report.selected_bytes,
        report.sample_byte_target,
        report.inputs_exhausted,
    );
    for cache in &report.caches {
        let total = cache.samples.total();
        println!(
            "  {}: {} values / {} bytes",
            cache.path.display(),
            total.count,
            total.bytes
        );
    }
}

fn print_evaluation(report: &EvaluationReport) {
    let samples = report.combined_samples.total();
    println!(
        "Evaluated family {}: {} caches, {} logical values / {} bytes",
        report.family,
        report.caches.len(),
        samples.count,
        samples.bytes
    );
    println!(
        "{:<28} {:>15} {:>9} {:>18} {:>12} {:>12}",
        "Candidate", "Raw compressed", "ratio", "Estimated stored", "encode ms", "decode ms"
    );
    for result in &report.combined_candidates {
        println!(
            "{:<28} {:>15} {:>8.2}% {:>18} {:>12.3} {:>12.3}",
            result.dictionary.name,
            result.combined.raw_compressed_bytes,
            result.combined.raw_compression_ratio.unwrap_or_default() * 100.0,
            result.combined.estimated_stored_bytes,
            result.combined.encode_ns as f64 / 1_000_000.0,
            result.combined.decode_ns as f64 / 1_000_000.0,
        );
    }
    println!("Note: {}", report.threshold_note);
    println!("Note: {}", report.timing_note);
}

fn write_json(path: Option<&Path>, report: &impl Serialize) -> Result<()> {
    if let Some(path) = path {
        let file = File::create(path)
            .with_context(|| format!("Failed to create JSON report {}", path.display()))?;
        serde_json::to_writer_pretty(BufWriter::new(file), report)?;
    }
    Ok(())
}

fn run(cli: Cli) -> Result<()> {
    match cli.command {
        Command::Train {
            source,
            output,
            json,
        } => {
            let report = train(&source, &output)?;
            print_training(&report);
            write_json(json.as_deref(), &report)
        }
        Command::Evaluate {
            source,
            dictionary,
            json,
        } => {
            let mut candidates = make_candidates(&dictionary)?;
            let caches = source
                .caches
                .iter()
                .map(|path| evaluate_cache(path, source.family, &mut candidates))
                .collect::<Result<Vec<_>>>()?;
            let report = combine_evaluation(source.family, caches, &candidates);
            print_evaluation(&report);
            write_json(json.as_deref(), &report)
        }
    }
}

fn main() {
    if let Err(error) = run(Cli::parse()) {
        eprintln!("Error: {error:#}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use std::{ffi::OsString, fs, path::PathBuf};

    use anyhow::Result;
    use byteorder::{BE, WriteBytesExt};
    use clap::Parser;
    use tempfile::TempDir;
    use turbo_persistence::{Compression, DbConfig, SerialScheduler, TurboPersistence};

    use super::{
        CacheSampleIter, Cli, DICTIONARY_SIZE, SAMPLE_BYTE_BUDGET, Source, empty_results,
        estimated_value_bytes, evaluate_cache, evaluate_sample, finalize_results, make_candidates,
        select_training_samples, train,
    };

    fn make_cache(family: usize, compression: Compression, values: usize) -> Result<TempDir> {
        let tempdir = tempfile::tempdir()?;
        let mut config = DbConfig::<8>::default();
        config.family_configs[family].compression = compression;
        let db = TurboPersistence::<SerialScheduler, 8>::open_with_config(
            tempdir.path().to_path_buf(),
            config,
        )?;
        let batch = db.write_batch()?;
        for index in 0..values {
            let key = format!("key-{index:06}").into_bytes();
            let value = if index.is_multiple_of(10) {
                vec![b'a' + (index % 26) as u8; 5000]
            } else {
                format!("function component{index}() {{ return null; }}")
                    .repeat(64)
                    .into_bytes()
            };
            batch.put(family as u32, key, value.into())?;
        }
        let mut state = 0x1234_5678_u32;
        let incompressible = (0..5000)
            .map(|_| {
                state ^= state << 13;
                state ^= state >> 17;
                state ^= state << 5;
                state as u8
            })
            .collect::<Vec<_>>();
        batch.put(
            family as u32,
            b"incompressible-medium".to_vec(),
            incompressible.into(),
        )?;
        db.commit_write_batch(batch)?;
        db.shutdown()?;
        Ok(tempdir)
    }

    #[test]
    fn clap_requires_family_output_and_cache() {
        assert!(Cli::try_parse_from(["tool", "train"]).is_err());
        assert!(Cli::try_parse_from(["tool", "train", "--family", "2", "cache"]).is_err());
        assert!(
            Cli::try_parse_from([
                "tool", "train", "--family", "2", "--output", "dict", "cache"
            ])
            .is_ok()
        );
        assert_eq!(DICTIONARY_SIZE, 64 * 1024);
        assert_eq!(SAMPLE_BYTE_BUDGET, 64 * 1024 * 1000);
    }

    #[test]
    fn threshold_proxy_is_strict() {
        assert_eq!(estimated_value_bytes(800, 699), 699);
        assert_eq!(estimated_value_bytes(800, 700), 800);
    }

    #[test]
    fn round_robin_samples_multiple_caches() -> Result<()> {
        let first = make_cache(2, Compression::Zstd3, 20)?;
        let second = make_cache(2, Compression::Zstd3, 20)?;
        let paths = [first.path().to_path_buf(), second.path().to_path_buf()];
        let selection = select_training_samples(&paths, 2, 10_000)?;
        assert!(!selection.samples.is_empty());
        assert!(!selection.inputs_exhausted);
        assert_eq!(selection.caches.len(), 2);
        assert_eq!(&selection.selected_cache_indices[..2], &[0, 1]);
        assert!(
            selection
                .caches
                .iter()
                .all(|report| report.samples.total().count > 0)
        );
        Ok(())
    }

    #[test]
    fn rejects_non_zstd_families_before_sampling() -> Result<()> {
        let cache = make_cache(2, Compression::Lz4, 20)?;
        let error = CacheSampleIter::open(cache.path().to_path_buf(), 2)
            .err()
            .expect("LZ4 family must be rejected");
        let message = format!("{error:#}");
        assert!(message.contains("00000001.sst"));
        assert!(message.contains("Lz4"));
        assert!(message.contains("requires Zstd3"));
        Ok(())
    }

    #[test]
    fn insufficient_samples_fail_with_context() -> Result<()> {
        let cache = make_cache(2, Compression::Zstd3, 1)?;
        let output_dir = tempfile::tempdir()?;
        let source = Source {
            family: 2,
            caches: vec![cache.path().to_path_buf()],
        };
        let error = train(&source, &output_dir.path().join("dictionary.zdict"))
            .err()
            .expect("one small cache should not train a 64 KiB dictionary");
        assert!(format!("{error:#}").contains("Failed to train a 65536-byte dictionary"));
        Ok(())
    }

    #[test]
    fn trains_replaces_output_and_evaluates() -> Result<()> {
        let cache = make_cache(2, Compression::Zstd3, 3000)?;
        let output_dir = tempfile::tempdir()?;
        let output = output_dir.path().join("dictionary.zdict");
        fs::write(&output, b"old")?;
        let source = Source {
            family: 2,
            caches: vec![cache.path().to_path_buf()],
        };
        let report = train(&source, &output)?;
        assert_eq!(report.dictionary.bytes, DICTIONARY_SIZE);
        assert_ne!(fs::read(&output)?, b"old");

        let mut candidates = make_candidates(&[output])?;
        let evaluation = evaluate_cache(cache.path(), 2, &mut candidates)?;
        assert_eq!(evaluation.candidates.len(), 2);
        assert!(evaluation.samples.slice.count > 0);
        assert!(evaluation.samples.medium.count > 0);
        Ok(())
    }

    #[test]
    fn reads_and_deduplicates_blob_samples() -> Result<()> {
        let cache = make_cache(2, Compression::Zstd3, 20)?;
        let value = b"export default function BlobComponent() {}".repeat(100);
        let compressed = zstd::bulk::compress(&value, 3)?;
        let mut blob = Vec::new();
        blob.write_u32::<BE>(value.len() as u32)?;
        blob.write_u32::<BE>(turbo_persistence::checksum_block(&compressed))?;
        blob.extend_from_slice(&compressed);
        fs::write(cache.path().join("00000042.blob"), blob)?;

        let mut iter = CacheSampleIter::open(cache.path().to_path_buf(), 2)?;
        let sample = iter
            .sample_from_value(turbo_persistence::IterValue::Blob {
                sequence_number: 42,
            })?
            .unwrap();
        assert_eq!(sample.data.as_ref(), value);
        let mut candidates = make_candidates(&[])?;
        let mut results = empty_results(&candidates);
        evaluate_sample(&sample, &mut candidates, &mut results)?;
        finalize_results(&mut results);
        assert_eq!(
            results[0].by_kind.blob.estimated_stored_bytes,
            results[0].by_kind.blob.raw_compressed_bytes + 8
        );
        assert!(
            iter.sample_from_value(turbo_persistence::IterValue::Blob {
                sequence_number: 42,
            })?
            .is_none()
        );
        assert_eq!(iter.duplicate_blob_references, 1);
        assert!(
            iter.sample_from_value(turbo_persistence::IterValue::Blob {
                sequence_number: 43,
            })
            .is_err()
        );
        Ok(())
    }

    #[test]
    fn active_ssts_follow_current_deletions_and_supersession() -> Result<()> {
        let cache = make_cache(2, Compression::Zstd3, 20)?;
        let original = turbo_persistence::offline::collect_sst_info(cache.path())?;
        assert_eq!(original[&2].len(), 1);

        fs::copy(
            cache.path().join("00000002.meta"),
            cache.path().join("00000003.meta"),
        )?;
        let mut current: serde_json::Value =
            serde_json::from_slice(&fs::read(cache.path().join("CURRENT"))?)?;
        current["max_sequence_number"] = 3.into();
        fs::write(cache.path().join("CURRENT"), serde_json::to_vec(&current)?)?;
        let superseded = turbo_persistence::offline::collect_sst_info(cache.path())?;
        assert_eq!(superseded[&2].len(), 1);

        let mut deletion = Vec::new();
        deletion.write_u32::<BE>(3)?;
        fs::write(cache.path().join("00000004.del"), deletion)?;
        let deleted = turbo_persistence::offline::collect_sst_info(cache.path())?;
        assert_eq!(deleted[&2].len(), 1);
        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn rejects_non_utf8_dictionary_name() {
        use std::os::unix::ffi::OsStringExt;

        let path = PathBuf::from(OsString::from_vec(vec![0xff]));
        assert!(super::dictionary_info(Some(&path), b"data", false).is_err());
    }
}
