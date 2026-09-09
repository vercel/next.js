//! Train and evaluate zstd dictionaries from logical values in persistence caches.

use std::{
    collections::{BTreeSet, HashSet, VecDeque},
    fs::{self, File},
    io::{BufWriter, Write},
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::{Context, Result, ensure};
use clap::{Args, Parser, Subcommand};
use lzzzz::lz4;
use serde::Serialize;
use turbo_persistence::{
    Compression, CompressionConfig, IterValue, MAX_INLINE_VALUE_SIZE, MIN_SMALL_VALUE_BLOCK_SIZE,
    StaticSortedFileIter, StaticSortedFileMetaData,
    offline::{SstInfo, collect_sst_info, decode_medium, read_blob},
};

const SCHEMA_VERSION: u32 = 5;
const DICTIONARY_SIZE: usize = 64 * 1024;
const SAMPLE_BUDGET_MULTIPLIER: usize = 1000;
const SAMPLE_BYTE_BUDGET: usize = DICTIONARY_SIZE * SAMPLE_BUDGET_MULTIPLIER;

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
    /// Compare dictionaries with LZ4 and zstd level 3 baselines.
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
    /// Dictionary used to compress the input caches.
    #[arg(long)]
    source_dictionary: Option<PathBuf>,
    /// Database directories containing CURRENT, meta, SST, and blob files.
    #[arg(required = true)]
    caches: Vec<PathBuf>,
}

#[derive(Clone, Serialize)]
struct DictionaryInfo {
    name: String,
    path: Option<PathBuf>,
    bytes: usize,
}

struct Candidate {
    info: DictionaryInfo,
    codec: CandidateCodec,
    setup_duration: Duration,
}

enum CandidateCodec {
    Lz4,
    Zstd {
        compressor: zstd::bulk::Compressor<'static>,
        decompressor: zstd::bulk::Decompressor<'static>,
    },
}

struct Sample {
    data: Arc<[u8]>,
    small_value_sst: Option<u32>,
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
struct CompressionMetric {
    input_bytes: u64,
    raw_compressed_bytes: u64,
    estimated_stored_bytes: u64,
    raw_compression_ratio: Option<f64>,
    encode_duration: Duration,
    decode_duration: Duration,
}

impl CompressionMetric {
    fn merge(&mut self, other: &Self) {
        self.input_bytes += other.input_bytes;
        self.raw_compressed_bytes += other.raw_compressed_bytes;
        self.estimated_stored_bytes += other.estimated_stored_bytes;
        self.encode_duration += other.encode_duration;
        self.decode_duration += other.decode_duration;
    }

    fn finalize(&mut self) {
        self.raw_compression_ratio = (self.input_bytes > 0)
            .then(|| self.raw_compressed_bytes as f64 / self.input_bytes as f64);
    }
}

#[derive(Clone, Serialize)]
struct CandidateResult {
    dictionary: DictionaryInfo,
    combined: CompressionMetric,
    setup_duration: Duration,
}

#[derive(Serialize)]
struct CacheReport {
    path: PathBuf,
    family: u32,
    active_ssts: u64,
    source_codecs: BTreeSet<String>,
    samples: Metric,
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
    combined_samples: Metric,
    combined_candidates: Vec<CandidateResult>,
}

#[derive(Serialize)]
struct TrainingCacheReport {
    path: PathBuf,
    source_codecs: BTreeSet<String>,
    samples: Metric,
}

#[derive(Serialize)]
struct TrainingReport {
    schema_version: u32,
    family: u32,
    zstd_version: &'static str,
    dictionary_size: usize,
    sample_byte_target: usize,
    selected: Metric,
    selected_bytes: u64,
    inputs_exhausted: bool,
    caches: Vec<TrainingCacheReport>,
    dictionary: DictionaryInfo,
}

struct CacheSampleIter {
    path: PathBuf,
    pending: VecDeque<(SstInfo, CompressionConfig)>,
    current: Option<(StaticSortedFileIter, CompressionConfig, u32)>,
    source_codecs: BTreeSet<String>,
    seen_blobs: HashSet<u32>,
    active_ssts: u64,
    duplicate_blob_references: u64,
}

fn source_compression_for_sst(
    path: &Path,
    family: u32,
    sst: &SstInfo,
    source_dictionary: Option<&'static [u8]>,
) -> Result<CompressionConfig> {
    match (sst.compression, sst.dictionary_id) {
        (Compression::Lz4, 0) => Ok(CompressionConfig::Lz4),
        (Compression::Lz4, id) => anyhow::bail!(
            "Cache {} family {family} SST {:08}.sst records LZ4 with unexpected dictionary ID {id}",
            path.display(),
            sst.sequence_number
        ),
        (Compression::Zstd3, 0) => Ok(CompressionConfig::Zstd3),
        (Compression::Zstd3, id) => {
            let dictionary = source_dictionary.with_context(|| {
                format!(
                    "Cache {} family {family} SST {:08}.sst requires source dictionary ID {id}",
                    path.display(),
                    sst.sequence_number
                )
            })?;
            let configured = CompressionConfig::Zstd3WithDictionary(dictionary);
            ensure!(
                configured.dictionary_id() == Some(id),
                "Cache {} family {family} SST {:08}.sst requires source dictionary ID {id}, but \
                 supplied dictionary has ID {:?}",
                path.display(),
                sst.sequence_number,
                configured.dictionary_id()
            );
            Ok(configured)
        }
    }
}

impl CacheSampleIter {
    fn open(path: PathBuf, family: u32, source_dictionary: Option<&'static [u8]>) -> Result<Self> {
        let mut families = collect_sst_info(&path)
            .with_context(|| format!("Failed to inspect cache {}", path.display()))?;
        let mut ssts = families.remove(&family).with_context(|| {
            format!(
                "Cache {} has no active SSTs for family {family}",
                path.display()
            )
        })?;
        // A stable SST order makes repeated runs against one unchanged cache snapshot comparable.
        ssts.sort_by_key(|sst| sst.sequence_number);
        let mut source_codecs = BTreeSet::new();
        let pending = ssts
            .into_iter()
            .map(|sst| {
                let compression =
                    source_compression_for_sst(&path, family, &sst, source_dictionary)?;
                source_codecs.insert(format!("{compression:?}"));
                Ok((sst, compression))
            })
            .collect::<Result<VecDeque<_>>>()?;
        Ok(Self {
            path,
            active_ssts: pending.len() as u64,
            pending,
            current: None,
            source_codecs,
            seen_blobs: HashSet::new(),
            duplicate_blob_references: 0,
        })
    }

    fn open_next_sst(&mut self) -> Result<bool> {
        let Some((sst, compression)) = self.pending.pop_front() else {
            return Ok(false);
        };
        let iter = StaticSortedFileIter::open(
            &self.path,
            StaticSortedFileMetaData {
                sequence_number: sst.sequence_number,
                block_count: sst.block_count,
            },
            compression,
        )
        .with_context(|| format!("Failed to open {:08}.sst", sst.sequence_number))?;
        self.current = Some((iter, compression, sst.sequence_number));
        Ok(true)
    }

    fn next_sample(&mut self) -> Result<Option<Sample>> {
        loop {
            if self.current.is_none() && !self.open_next_sst()? {
                return Ok(None);
            }
            let (iter, compression, sequence_number) = self.current.as_mut().unwrap();
            let compression = *compression;
            let sequence_number = *sequence_number;
            let entry = match iter.next() {
                Some(entry) => entry?,
                None => {
                    self.current = None;
                    continue;
                }
            };
            if let Some(sample) =
                self.sample_from_value(entry.value, compression, sequence_number)?
            {
                return Ok(Some(sample));
            }
        }
    }

    fn sample_from_value(
        &mut self,
        value: IterValue,
        compression: CompressionConfig,
        sequence_number: u32,
    ) -> Result<Option<Sample>> {
        match value {
            IterValue::Slice { value } if value.len() > MAX_INLINE_VALUE_SIZE => Ok(Some(Sample {
                data: Arc::from(value.as_ref()),
                small_value_sst: Some(sequence_number),
            })),
            IterValue::Medium {
                uncompressed_size,
                checksum,
                block,
            } => {
                let value = decode_medium(compression, uncompressed_size, checksum, &block)
                    .with_context(|| {
                        format!("Failed to read medium value in {}", self.path.display())
                    })?;
                Ok(Some(Sample {
                    data: value,
                    small_value_sst: None,
                }))
            }
            IterValue::Blob { sequence_number } => {
                if !self.seen_blobs.insert(sequence_number) {
                    self.duplicate_blob_references += 1;
                    return Ok(None);
                }
                let value = read_blob(&self.path, sequence_number, compression)?;
                Ok(Some(Sample {
                    data: value,
                    small_value_sst: None,
                }))
            }
            // Inline values live in key blocks and are not independently compressed.
            IterValue::KeyDeleted | IterValue::KeyValueDeleted { .. } | IterValue::Slice { .. } => {
                Ok(None)
            }
        }
    }
}

/// Groups logical small values into production-like SST-local compression units for evaluation.
struct EvaluationSampleIter {
    source: CacheSampleIter,
    small_block: Vec<u8>,
    small_block_sst: Option<u32>,
}

impl EvaluationSampleIter {
    fn new(source: CacheSampleIter) -> Self {
        Self {
            source,
            small_block: Vec::with_capacity(MIN_SMALL_VALUE_BLOCK_SIZE),
            small_block_sst: None,
        }
    }

    fn next_sample(&mut self) -> Result<Option<Sample>> {
        loop {
            match self.source.next_sample()? {
                Some(sample) => match sample.small_value_sst {
                    None => return Ok(Some(sample)),
                    Some(sequence_number) => {
                        if self.small_block_sst != Some(sequence_number)
                            && !self.small_block.is_empty()
                        {
                            let completed = std::mem::take(&mut self.small_block);
                            self.small_block_sst = Some(sequence_number);
                            self.small_block.extend_from_slice(&sample.data);
                            return Ok(Some(Sample {
                                data: completed.into(),
                                small_value_sst: None,
                            }));
                        }
                        self.small_block_sst = Some(sequence_number);
                        self.small_block.extend_from_slice(&sample.data);
                        if self.small_block.len() >= MIN_SMALL_VALUE_BLOCK_SIZE {
                            let completed = std::mem::take(&mut self.small_block);
                            return Ok(Some(Sample {
                                data: completed.into(),
                                small_value_sst: None,
                            }));
                        }
                    }
                },
                None if self.small_block.is_empty() => return Ok(None),
                None => {
                    let completed = std::mem::take(&mut self.small_block);
                    return Ok(Some(Sample {
                        data: completed.into(),
                        small_value_sst: None,
                    }));
                }
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
    })
}

fn make_candidates(paths: &[PathBuf]) -> Result<Vec<Candidate>> {
    let mut result = Vec::with_capacity(paths.len() + 2);
    result.push(Candidate {
        info: DictionaryInfo {
            name: "lz4".to_owned(),
            path: None,
            bytes: 0,
        },
        codec: CandidateCodec::Lz4,
        setup_duration: Duration::ZERO,
    });
    let started = Instant::now();
    result.push(Candidate {
        info: dictionary_info(None, &[], true)?,
        codec: CandidateCodec::Zstd {
            compressor: zstd::bulk::Compressor::new(3)?,
            decompressor: zstd::bulk::Decompressor::new()?,
        },
        setup_duration: started.elapsed(),
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
            codec: CandidateCodec::Zstd {
                compressor: zstd::bulk::Compressor::with_dictionary(3, &dictionary)?,
                decompressor: zstd::bulk::Decompressor::with_dictionary(&dictionary)?,
            },
            setup_duration: started.elapsed(),
        });
    }
    Ok(result)
}

impl Candidate {
    fn compress(&mut self, input: &[u8]) -> Result<Vec<u8>> {
        match &mut self.codec {
            CandidateCodec::Lz4 => {
                let mut output = Vec::new();
                lz4::compress_to_vec(input, &mut output, lz4::ACC_LEVEL_DEFAULT)?;
                Ok(output)
            }
            CandidateCodec::Zstd { compressor, .. } => Ok(compressor.compress(input)?),
        }
    }

    fn decompress(&mut self, input: &[u8], output_len: usize) -> Result<Vec<u8>> {
        match &mut self.codec {
            CandidateCodec::Lz4 => {
                let mut output = vec![0; output_len];
                let written = lz4::decompress(input, &mut output)?;
                ensure!(written == output_len, "LZ4 decompressed length mismatch");
                Ok(output)
            }
            CandidateCodec::Zstd { decompressor, .. } => {
                Ok(decompressor.decompress(input, output_len)?)
            }
        }
    }
}

/// Evaluates all compression candidates against one approximated compression unit.
fn evaluate_sample(
    sample: &Sample,
    candidates: &mut [Candidate],
    results: &mut [CandidateResult],
) -> Result<()> {
    for (candidate, result) in candidates.iter_mut().zip(results) {
        let started = Instant::now();
        let compressed = candidate
            .compress(&sample.data)
            .with_context(|| format!("Failed to compress with {}", candidate.info.name))?;
        let encode_duration = started.elapsed();
        let started = Instant::now();
        let decompressed = candidate
            .decompress(&compressed, sample.data.len())
            .with_context(|| format!("Failed to decompress with {}", candidate.info.name))?;
        let decode_duration = started.elapsed();
        ensure!(
            decompressed.as_slice() == sample.data.as_ref(),
            "Round-trip mismatch with {}",
            candidate.info.name
        );

        let metric = &mut result.combined;
        metric.input_bytes += sample.data.len() as u64;
        metric.raw_compressed_bytes += compressed.len() as u64;
        metric.encode_duration += encode_duration;
        metric.decode_duration += decode_duration;
        metric.estimated_stored_bytes +=
            estimated_value_bytes(sample.data.len(), compressed.len()) as u64;
    }
    Ok(())
}

/// Applies the writer's 12.5% minimum-savings rule to an approximated compression unit.
///
/// Small values are grouped before this call; medium values and blobs arrive independently. See
/// `write_block_to_file` for the production block-level rule.
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
            combined: CompressionMetric::default(),
            setup_duration: candidate.setup_duration,
        })
        .collect()
}

fn finalize_results(results: &mut [CandidateResult]) {
    for result in results {
        result.combined.finalize();
    }
}

fn evaluate_cache(
    path: &Path,
    family: u32,
    source_dictionary: Option<&'static [u8]>,
    candidates: &mut [Candidate],
) -> Result<CacheReport> {
    let source = CacheSampleIter::open(path.to_path_buf(), family, source_dictionary)?;
    let mut iter = EvaluationSampleIter::new(source);
    let mut samples = Metric::default();
    let mut results = empty_results(candidates);
    while let Some(sample) = iter.next_sample()? {
        samples.add(sample.data.len());
        evaluate_sample(&sample, candidates, &mut results)?;
    }
    finalize_results(&mut results);
    Ok(CacheReport {
        path: path.to_path_buf(),
        family,
        active_ssts: iter.source.active_ssts,
        source_codecs: iter.source.source_codecs,
        samples,
        duplicate_blob_references: iter.source.duplicate_blob_references,
        candidates: results,
    })
}

fn combine_evaluation(
    family: u32,
    caches: Vec<CacheReport>,
    candidates: &[Candidate],
) -> EvaluationReport {
    let mut combined_samples = Metric::default();
    let mut combined_candidates = empty_results(candidates);
    for cache in &caches {
        combined_samples.merge(&cache.samples);
        for (combined, current) in combined_candidates.iter_mut().zip(&cache.candidates) {
            combined.combined.merge(&current.combined);
        }
    }
    finalize_results(&mut combined_candidates);
    EvaluationReport {
        schema_version: SCHEMA_VERSION,
        family,
        timing_note: "Single-pass wall-clock diagnostics; byte/count fields are the comparison \
                      contract.",
        threshold_note: "Small logical values are grouped into SST-local 8-12 KiB evaluation \
                         units; medium values and blobs remain independent. Estimated stored \
                         bytes apply the 12.5% rule per unit and exclude fixed container headers.",
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
    source_dictionary: Option<&'static [u8]>,
    byte_budget: usize,
) -> Result<TrainingSelection> {
    let mut paths = paths.to_vec();
    paths.sort();
    let mut iterators = paths
        .into_iter()
        .map(|path| CacheSampleIter::open(path, family, source_dictionary))
        .collect::<Result<Vec<_>>>()?;
    let mut per_cache = iterators
        .iter()
        .map(|iter| TrainingCacheReport {
            path: iter.path.clone(),
            source_codecs: iter.source_codecs.clone(),
            samples: Metric::default(),
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
                    per_cache[index].samples.add(sample.data.len());
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

fn write_dictionary(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut file = File::create(path)
        .with_context(|| format!("Failed to create dictionary {}", path.display()))?;
    file.write_all(bytes)
        .with_context(|| format!("Failed to write dictionary {}", path.display()))
}

fn source_dictionary(source: &Source) -> Result<Option<&'static [u8]>> {
    source
        .source_dictionary
        .as_ref()
        .map(|path| {
            fs::read(path)
                .with_context(|| format!("Failed to read source dictionary {}", path.display()))
                .map(|bytes| Box::leak(bytes.into_boxed_slice()) as &'static [u8])
        })
        .transpose()
}

fn train(source: &Source, output: &Path) -> Result<TrainingReport> {
    let source_dictionary = source_dictionary(source)?;
    let TrainingSelection {
        samples,
        caches,
        inputs_exhausted,
        ..
    } = select_training_samples(
        &source.caches,
        source.family,
        source_dictionary,
        SAMPLE_BYTE_BUDGET,
    )?;
    ensure!(!samples.is_empty(), "No eligible values found for training");
    let selected = caches.iter().fold(Metric::default(), |mut total, cache| {
        total.merge(&cache.samples);
        total
    });
    let selected_bytes = selected.bytes;
    let dictionary = zstd::dict::from_samples(&samples, DICTIONARY_SIZE).with_context(|| {
        format!(
            "Failed to train a {DICTIONARY_SIZE}-byte dictionary from {} values ({selected_bytes} \
             bytes)",
            samples.len()
        )
    })?;
    write_dictionary(output, &dictionary)?;
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
        "Trained {} ({} bytes) from {} values / {} bytes (target {}, exhausted: {})",
        report.dictionary.path.as_ref().unwrap().display(),
        report.dictionary.bytes,
        report.selected.count,
        report.selected_bytes,
        report.sample_byte_target,
        report.inputs_exhausted,
    );
    for cache in &report.caches {
        println!(
            "  {} ({:?}): {} values / {} bytes",
            cache.path.display(),
            cache.source_codecs,
            cache.samples.count,
            cache.samples.bytes
        );
    }
}

fn print_evaluation(report: &EvaluationReport) {
    let samples = &report.combined_samples;
    println!(
        "Evaluated family {}: {} caches, {} compression units / {} bytes",
        report.family,
        report.caches.len(),
        samples.count,
        samples.bytes
    );
    for cache in &report.caches {
        println!("  {}: {:?}", cache.path.display(), cache.source_codecs);
    }
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
            result.combined.encode_duration.as_secs_f64() * 1_000.0,
            result.combined.decode_duration.as_secs_f64() * 1_000.0,
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
            let source_dictionary = source_dictionary(&source)?;
            let caches = source
                .caches
                .iter()
                .map(|path| evaluate_cache(path, source.family, source_dictionary, &mut candidates))
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
    use std::{collections::BTreeSet, fs};

    use anyhow::Result;
    use byteorder::{BE, WriteBytesExt};
    use tempfile::TempDir;
    use turbo_persistence::{
        Compression, CompressionConfig, DbConfig, MIN_SMALL_VALUE_BLOCK_SIZE, SerialScheduler,
        TurboPersistence,
    };

    use super::{
        CacheSampleIter, DICTIONARY_SIZE, EvaluationSampleIter, Source, empty_results,
        evaluate_cache, evaluate_sample, finalize_results, make_candidates,
        select_training_samples, train,
    };

    fn make_cache(family: usize, compression: Compression, values: usize) -> Result<TempDir> {
        make_cache_with_config(family, compression.into(), values)
    }

    fn make_cache_with_config(
        family: usize,
        compression: CompressionConfig,
        values: usize,
    ) -> Result<TempDir> {
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
    fn round_robin_samples_multiple_caches() -> Result<()> {
        let first = make_cache(2, Compression::Zstd3, 20)?;
        let second = make_cache(2, Compression::Lz4, 20)?;
        let paths = [first.path().to_path_buf(), second.path().to_path_buf()];
        let selection = select_training_samples(&paths, 2, None, 10_000)?;
        assert!(!selection.samples.is_empty());
        assert!(!selection.inputs_exhausted);
        assert_eq!(selection.caches.len(), 2);
        assert_eq!(&selection.selected_cache_indices[..2], &[0, 1]);
        let source_codecs = selection
            .caches
            .iter()
            .flat_map(|cache| cache.source_codecs.iter())
            .collect::<BTreeSet<_>>();
        assert!(source_codecs.contains(&"Zstd3".to_owned()));
        assert!(source_codecs.contains(&"Lz4".to_owned()));
        assert!(
            selection
                .caches
                .iter()
                .all(|report| report.samples.count > 0)
        );
        Ok(())
    }

    #[test]
    fn evaluation_groups_small_values_into_production_sized_blocks() -> Result<()> {
        let cache = make_cache(2, Compression::Zstd3, 20)?;
        let mut raw = CacheSampleIter::open(cache.path().to_path_buf(), 2, None)?;
        let mut raw_count = 0;
        while raw.next_sample()?.is_some() {
            raw_count += 1;
        }

        let source = CacheSampleIter::open(cache.path().to_path_buf(), 2, None)?;
        let mut grouped = EvaluationSampleIter::new(source);
        let mut sizes = Vec::new();
        while let Some(sample) = grouped.next_sample()? {
            sizes.push(sample.data.len());
        }
        assert!(sizes.len() < raw_count);
        assert!(sizes.iter().any(|&size| {
            (MIN_SMALL_VALUE_BLOCK_SIZE..MIN_SMALL_VALUE_BLOCK_SIZE + 4096).contains(&size)
        }));
        Ok(())
    }

    #[test]
    fn accepts_lz4_source_cache_and_ignores_source_dictionary() -> Result<()> {
        let cache = make_cache(2, Compression::Lz4, 20)?;
        let mut iter =
            CacheSampleIter::open(cache.path().to_path_buf(), 2, Some(b"irrelevant for LZ4"))?;
        assert!(iter.source_codecs.contains("Lz4"));
        assert!(iter.next_sample()?.is_some());

        let cache = make_cache(2, Compression::Zstd3, 20)?;
        let mut iter = CacheSampleIter::open(
            cache.path().to_path_buf(),
            2,
            Some(b"irrelevant for plain zstd"),
        )?;
        assert!(iter.source_codecs.contains("Zstd3"));
        assert!(iter.next_sample()?.is_some());
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
            source_dictionary: None,
            caches: vec![cache.path().to_path_buf()],
        };
        let report = train(&source, &output)?;
        assert_eq!(report.dictionary.bytes, DICTIONARY_SIZE);
        assert_ne!(fs::read(&output)?, b"old");

        let mut candidates = make_candidates(&[output])?;
        let evaluation = evaluate_cache(cache.path(), 2, None, &mut candidates)?;
        assert_eq!(evaluation.candidates.len(), 3);
        assert_eq!(evaluation.candidates[0].dictionary.name, "lz4");
        assert_eq!(
            evaluation.candidates[1].dictionary.name,
            "zstd3 (no dictionary)"
        );
        assert!(evaluation.samples.count > 0);
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

        let mut iter = CacheSampleIter::open(cache.path().to_path_buf(), 2, None)?;
        let sample = iter
            .sample_from_value(
                turbo_persistence::IterValue::Blob {
                    sequence_number: 42,
                },
                CompressionConfig::Zstd3,
                1,
            )?
            .unwrap();
        assert_eq!(sample.data.as_ref(), value);
        let mut candidates = make_candidates(&[])?;
        let mut results = empty_results(&candidates);
        evaluate_sample(&sample, &mut candidates, &mut results)?;
        finalize_results(&mut results);
        assert_eq!(
            results[0].combined.estimated_stored_bytes,
            results[0].combined.raw_compressed_bytes
        );
        assert!(
            iter.sample_from_value(
                turbo_persistence::IterValue::Blob {
                    sequence_number: 42
                },
                CompressionConfig::Zstd3,
                1,
            )?
            .is_none()
        );
        assert_eq!(iter.duplicate_blob_references, 1);
        assert!(
            iter.sample_from_value(
                turbo_persistence::IterValue::Blob {
                    sequence_number: 43
                },
                CompressionConfig::Zstd3,
                1,
            )
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
}
