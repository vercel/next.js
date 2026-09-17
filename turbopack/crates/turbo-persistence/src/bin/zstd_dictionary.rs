//! Train a zstd dictionary from logical values in persistence caches.

use std::{
    collections::{HashSet, VecDeque},
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::{Context, Result, ensure};
use clap::Parser;
use lzzzz::lz4;
use turbo_persistence::{
    AccessMode, Compression, CompressionConfig, IterValue, MAX_INLINE_VALUE_SIZE,
    MAX_SMALL_VALUE_SIZE, MIN_SMALL_VALUE_BLOCK_SIZE, StaticSortedFileIter,
    StaticSortedFileMetaData,
    offline::{SstInfo, collect_sst_info, decode_medium, read_blob},
};

const DICTIONARY_SIZE: usize = 64 * 1024;
const SAMPLE_BUDGET_MULTIPLIER: usize = 1000;
const SAMPLE_BYTE_BUDGET: usize = DICTIONARY_SIZE * SAMPLE_BUDGET_MULTIPLIER;

#[derive(Parser)]
#[command(about = "Train a zstd dictionary from persistence caches")]
struct Cli {
    /// Persistence family ID to inspect.
    #[arg(long)]
    family: u32,
    /// Dictionary output path. Existing files are replaced.
    #[arg(short, long)]
    output: PathBuf,
    /// Dictionary used to compress the input caches.
    #[arg(long)]
    source_dictionary: Option<PathBuf>,
    /// Database directories containing CURRENT, meta, SST, and blob files.
    #[arg(required = true)]
    caches: Vec<PathBuf>,
}

struct Candidate {
    name: String,
    codec: CandidateCodec,
}

enum CandidateCodec {
    Lz4,
    Zstd {
        compressor: zstd::bulk::Compressor<'static>,
        decompressor: zstd::bulk::Decompressor<'static>,
    },
}

type Sample = Arc<[u8]>;

#[derive(Default, Clone)]
struct Metric {
    count: u64,
    bytes: u64,
}

impl Metric {
    fn add(&mut self, bytes: usize) {
        self.count += 1;
        self.bytes += bytes as u64;
    }
}

#[derive(Default, Clone)]
struct CompressionMetric {
    input_bytes: u64,
    raw_compressed_bytes: u64,
    estimated_stored_bytes: u64,
    raw_compression_ratio: Option<f64>,
    encode_duration: Duration,
    decode_duration: Duration,
}

impl CompressionMetric {
    fn finalize(&mut self) {
        self.raw_compression_ratio = (self.input_bytes > 0)
            .then(|| self.raw_compressed_bytes as f64 / self.input_bytes as f64);
    }
}

#[derive(Clone)]
struct CandidateResult {
    name: String,
    combined: CompressionMetric,
}

struct CacheSampleIter {
    path: PathBuf,
    pending: VecDeque<(SstInfo, CompressionConfig)>,
    current: Option<(StaticSortedFileIter, CompressionConfig)>,
    seen_blobs: HashSet<u32>,
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
        let pending = ssts
            .into_iter()
            .map(|sst| {
                let compression =
                    source_compression_for_sst(&path, family, &sst, source_dictionary)?;
                Ok((sst, compression))
            })
            .collect::<Result<VecDeque<_>>>()?;
        Ok(Self {
            path,
            pending,
            current: None,
            seen_blobs: HashSet::new(),
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
            AccessMode::Mmap,
        )
        .with_context(|| format!("Failed to open {:08}.sst", sst.sequence_number))?;
        self.current = Some((iter, compression));
        Ok(true)
    }

    fn next_sample(&mut self) -> Result<Option<Sample>> {
        loop {
            if self.current.is_none() && !self.open_next_sst()? {
                return Ok(None);
            }
            let (iter, compression) = self.current.as_mut().unwrap();
            let compression = *compression;
            let entry = match iter.next() {
                Some(entry) => entry?,
                None => {
                    self.current = None;
                    continue;
                }
            };
            if let Some(sample) = self.sample_from_value(entry.value, compression)? {
                return Ok(Some(sample));
            }
        }
    }

    fn sample_from_value(
        &mut self,
        value: IterValue,
        compression: CompressionConfig,
    ) -> Result<Option<Sample>> {
        match value {
            IterValue::Slice { value } if value.len() > MAX_INLINE_VALUE_SIZE => {
                Ok(Some(Arc::from(value.as_ref())))
            }
            IterValue::Medium {
                uncompressed_size,
                checksum,
                block,
            } => {
                let value = decode_medium(compression, uncompressed_size, checksum, &block)
                    .with_context(|| {
                        format!("Failed to read medium value in {}", self.path.display())
                    })?;
                Ok(Some(value))
            }
            IterValue::Blob { sequence_number } => {
                if !self.seen_blobs.insert(sequence_number) {
                    return Ok(None);
                }
                let value = read_blob(&self.path, sequence_number, compression)?;
                Ok(Some(value))
            }
            // Inline values live in key blocks and are not independently compressed.
            IterValue::KeyDeleted | IterValue::KeyValueDeleted { .. } | IterValue::Slice { .. } => {
                Ok(None)
            }
        }
    }
}

/// Groups logical small values into production-like compression units for reporting.
struct EvaluationSampleIter {
    source: CacheSampleIter,
    small_block: Vec<u8>,
}

impl EvaluationSampleIter {
    fn new(source: CacheSampleIter) -> Self {
        Self {
            source,
            small_block: Vec::with_capacity(MIN_SMALL_VALUE_BLOCK_SIZE),
        }
    }

    fn next_sample(&mut self) -> Result<Option<Sample>> {
        loop {
            match self.source.next_sample()? {
                Some(sample) if sample.len() > MAX_SMALL_VALUE_SIZE => {
                    return Ok(Some(sample));
                }
                Some(sample) => {
                    self.small_block.extend_from_slice(&sample);
                    if self.small_block.len() >= MIN_SMALL_VALUE_BLOCK_SIZE {
                        return Ok(Some(std::mem::take(&mut self.small_block).into()));
                    }
                }
                None if self.small_block.is_empty() => return Ok(None),
                None => return Ok(Some(std::mem::take(&mut self.small_block).into())),
            }
        }
    }
}

fn make_candidates(path: &Path) -> Result<Vec<Candidate>> {
    let dictionary =
        fs::read(path).with_context(|| format!("Failed to read dictionary {}", path.display()))?;
    ensure!(
        !dictionary.is_empty(),
        "Dictionary {} is empty",
        path.display()
    );
    Ok(vec![
        Candidate {
            name: "lz4".to_owned(),
            codec: CandidateCodec::Lz4,
        },
        Candidate {
            name: "zstd3".to_owned(),
            codec: CandidateCodec::Zstd {
                compressor: zstd::bulk::Compressor::new(3)?,
                decompressor: zstd::bulk::Decompressor::new()?,
            },
        },
        Candidate {
            name: "zstd3 + dictionary".to_owned(),
            codec: CandidateCodec::Zstd {
                compressor: zstd::bulk::Compressor::with_dictionary(3, &dictionary)?,
                decompressor: zstd::bulk::Decompressor::with_dictionary(&dictionary)?,
            },
        },
    ])
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
            .compress(sample)
            .with_context(|| format!("Failed to compress with {}", candidate.name))?;
        let encode_duration = started.elapsed();
        let started = Instant::now();
        let decompressed = candidate
            .decompress(&compressed, sample.len())
            .with_context(|| format!("Failed to decompress with {}", candidate.name))?;
        let decode_duration = started.elapsed();
        ensure!(
            decompressed.as_slice() == sample.as_ref(),
            "Round-trip mismatch with {}",
            candidate.name
        );

        let metric = &mut result.combined;
        metric.input_bytes += sample.len() as u64;
        metric.raw_compressed_bytes += compressed.len() as u64;
        metric.encode_duration += encode_duration;
        metric.decode_duration += decode_duration;
        metric.estimated_stored_bytes +=
            estimated_value_bytes(sample.len(), compressed.len()) as u64;
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
            name: candidate.name.clone(),
            combined: CompressionMetric::default(),
        })
        .collect()
}

fn finalize_results(results: &mut [CandidateResult]) {
    for result in results {
        result.combined.finalize();
    }
}

fn evaluate(
    paths: &[PathBuf],
    family: u32,
    source_dictionary: Option<&'static [u8]>,
    candidates: &mut [Candidate],
) -> Result<(Metric, Vec<CandidateResult>)> {
    let mut samples = Metric::default();
    let mut results = empty_results(candidates);
    for path in paths {
        let source = CacheSampleIter::open(path.clone(), family, source_dictionary)?;
        let mut iter = EvaluationSampleIter::new(source);
        while let Some(sample) = iter.next_sample()? {
            samples.add(sample.len());
            evaluate_sample(&sample, candidates, &mut results)?;
        }
    }
    finalize_results(&mut results);
    Ok((samples, results))
}

struct TrainingSelection {
    samples: Vec<Box<[u8]>>,
    selected_bytes: usize,
    inputs_exhausted: bool,
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
    let mut samples = Vec::new();
    let mut selected_bytes = 0_usize;
    let mut active = vec![true; iterators.len()];
    let mut active_count = iterators.len();

    while active_count > 0 && selected_bytes < byte_budget {
        for index in 0..iterators.len() {
            if !active[index] {
                continue;
            }
            match iterators[index].next_sample()? {
                Some(sample) => {
                    selected_bytes += sample.len();
                    samples.push(Box::from(sample.as_ref()));
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
        selected_bytes,
        inputs_exhausted: active_count == 0,
    })
}

fn write_dictionary(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut file = File::create(path)
        .with_context(|| format!("Failed to create dictionary {}", path.display()))?;
    file.write_all(bytes)
        .with_context(|| format!("Failed to write dictionary {}", path.display()))
}

fn source_dictionary(path: Option<&Path>) -> Result<Option<&'static [u8]>> {
    path.map(|path| {
        fs::read(path)
            .with_context(|| format!("Failed to read source dictionary {}", path.display()))
            // This short-lived CLI needs a static slice for CompressionConfig; leaking one optional
            // input dictionary is simpler than adding ownership to the persistence read APIs.
            .map(|bytes| Box::leak(bytes.into_boxed_slice()) as &'static [u8])
    })
    .transpose()
}

fn print_results(family: u32, cache_count: usize, samples: &Metric, results: &[CandidateResult]) {
    println!(
        "Compared family {family} from {cache_count} caches ({} units / {} bytes)",
        samples.count, samples.bytes
    );
    println!(
        "{:<24} {:>15} {:>9} {:>18} {:>12} {:>12}",
        "Codec", "Raw compressed", "ratio", "Estimated stored", "encode ms", "decode ms"
    );
    for result in results {
        println!(
            "{:<24} {:>15} {:>8.2}% {:>18} {:>12.3} {:>12.3}",
            result.name,
            result.combined.raw_compressed_bytes,
            result.combined.raw_compression_ratio.unwrap_or_default() * 100.0,
            result.combined.estimated_stored_bytes,
            result.combined.encode_duration.as_secs_f64() * 1_000.0,
            result.combined.decode_duration.as_secs_f64() * 1_000.0,
        );
    }
    println!("Note: comparison reuses training inputs; validate with a real Next.js build.");
}

fn run(cli: Cli) -> Result<()> {
    let source_dictionary = source_dictionary(cli.source_dictionary.as_deref())?;
    let TrainingSelection {
        samples,
        selected_bytes,
        inputs_exhausted,
    } = select_training_samples(
        &cli.caches,
        cli.family,
        source_dictionary,
        SAMPLE_BYTE_BUDGET,
    )?;
    ensure!(!samples.is_empty(), "No eligible values found for training");
    let sample_count = samples.len();
    let dictionary = zstd::dict::from_samples(&samples, DICTIONARY_SIZE).with_context(|| {
        format!(
            "Failed to train a {DICTIONARY_SIZE}-byte dictionary from {sample_count} values \
             ({selected_bytes} bytes)"
        )
    })?;
    drop(samples);
    write_dictionary(&cli.output, &dictionary)?;
    println!(
        "Trained {} ({} bytes) from {} values / {} bytes (inputs exhausted: {})",
        cli.output.display(),
        dictionary.len(),
        sample_count,
        selected_bytes,
        inputs_exhausted,
    );

    let mut candidates = make_candidates(&cli.output)?;
    let (samples, results) = evaluate(&cli.caches, cli.family, source_dictionary, &mut candidates)?;
    print_results(cli.family, cli.caches.len(), &samples, &results);
    Ok(())
}

fn main() {
    if let Err(error) = run(Cli::parse()) {
        eprintln!("Error: {error:#}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use anyhow::Result;
    use byteorder::{BE, WriteBytesExt};
    use tempfile::TempDir;
    use turbo_persistence::{
        Compression, CompressionConfig, DbConfig, MIN_SMALL_VALUE_BLOCK_SIZE, SerialScheduler,
        TurboPersistence,
    };

    use super::{
        CacheSampleIter, Cli, DICTIONARY_SIZE, EvaluationSampleIter, run, select_training_samples,
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
        assert!(selection.selected_bytes >= 10_000);
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
            sizes.push(sample.len());
        }
        assert!(sizes.len() < raw_count);
        assert!(sizes.iter().any(|&size| {
            (MIN_SMALL_VALUE_BLOCK_SIZE..MIN_SMALL_VALUE_BLOCK_SIZE + 4096).contains(&size)
        }));
        Ok(())
    }

    #[test]
    fn trains_reports_and_replaces_output() -> Result<()> {
        let cache = make_cache(2, Compression::Lz4, 3000)?;
        let output_dir = tempfile::tempdir()?;
        let output = output_dir.path().join("dictionary.zdict");
        fs::write(&output, b"old")?;
        run(Cli {
            family: 2,
            output: output.clone(),
            source_dictionary: None,
            caches: vec![cache.path().to_path_buf()],
        })?;
        assert_eq!(fs::read(&output)?.len(), DICTIONARY_SIZE);
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
            )?
            .unwrap();
        assert_eq!(sample.as_ref(), value);
        assert!(
            iter.sample_from_value(
                turbo_persistence::IterValue::Blob {
                    sequence_number: 42
                },
                CompressionConfig::Zstd3,
            )?
            .is_none()
        );
        assert!(
            iter.sample_from_value(
                turbo_persistence::IterValue::Blob {
                    sequence_number: 43
                },
                CompressionConfig::Zstd3,
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
