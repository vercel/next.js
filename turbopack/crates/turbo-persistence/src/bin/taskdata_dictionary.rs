//! Evaluate zstd dictionaries against TaskData blocks from existing persistence caches.

use std::{
    collections::{BTreeMap, BTreeSet},
    env,
    ffi::OsString,
    fs::File,
    io::BufWriter,
    mem::size_of,
    path::{Path, PathBuf},
    time::Instant,
};

use anyhow::{Context, Result, bail, ensure};
use serde::Serialize;
use turbo_persistence::{
    BLOCK_HEADER_SIZE,
    offline::{
        KeyBlockHeader, MIN_KEY_SIZE_FOR_COMPRESSION, SstInfo, collect_sst_info,
        key_block_entry_types, max_key_length, open_sst, parse_key_block_header,
        parse_key_block_indices, read_block,
    },
    static_sorted_file::KEY_BLOCK_ENTRY_TYPE_BLOB,
};
use xxhash_rust::xxh3::xxh3_64;

const SCHEMA_VERSION: u32 = 1;

#[derive(Default)]
struct Options {
    family: u32,
    dictionaries: Vec<PathBuf>,
    json: Option<PathBuf>,
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

#[derive(Default, Clone, Serialize)]
struct BlockGroup {
    count: u64,
    bytes: u64,
}

impl BlockGroup {
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
struct BlockSummary {
    eligible_key: BlockGroup,
    eligible_value: BlockGroup,
    excluded_key: BlockGroup,
    excluded_index: BlockGroup,
    size_buckets: BTreeMap<&'static str, BlockGroup>,
    blob_references: u64,
}

impl BlockSummary {
    fn add_eligible_size(&mut self, bytes: usize) {
        self.size_buckets
            .entry(size_bucket(bytes))
            .or_default()
            .add(bytes);
    }

    fn merge(&mut self, other: &Self) {
        self.eligible_key.merge(&other.eligible_key);
        self.eligible_value.merge(&other.eligible_value);
        self.excluded_key.merge(&other.excluded_key);
        self.excluded_index.merge(&other.excluded_index);
        self.blob_references += other.blob_references;
        for (bucket, group) in &other.size_buckets {
            self.size_buckets.entry(bucket).or_default().merge(group);
        }
    }
}

#[derive(Default, Clone, Serialize)]
struct CandidateResult {
    dictionary: Option<DictionaryInfo>,
    raw_compressed_bytes: u64,
    modeled_payload_bytes: u64,
    modeled_complete_sst_bytes: u64,
    raw_compression_ratio: Option<f64>,
    modeled_delta_vs_baseline_pct: Option<f64>,
    modeled_delta_vs_current_pct: Option<f64>,
    compressed_blocks: u64,
    fallback_blocks: u64,
    became_compressed: u64,
    became_uncompressed: u64,
    setup_ns: u64,
    encode_ns: u64,
    decode_ns: u64,
}

impl CandidateResult {
    fn merge(&mut self, other: &Self) {
        self.raw_compressed_bytes += other.raw_compressed_bytes;
        self.modeled_payload_bytes += other.modeled_payload_bytes;
        self.modeled_complete_sst_bytes += other.modeled_complete_sst_bytes;
        self.compressed_blocks += other.compressed_blocks;
        self.fallback_blocks += other.fallback_blocks;
        self.became_compressed += other.became_compressed;
        self.became_uncompressed += other.became_uncompressed;
        self.encode_ns += other.encode_ns;
        self.decode_ns += other.decode_ns;
    }
}

#[derive(Serialize)]
struct CacheReport {
    path: PathBuf,
    family: u32,
    recorded_codecs: BTreeSet<String>,
    active_ssts: u64,
    original_complete_sst_bytes: u64,
    original_eligible_payload_bytes: u64,
    blocks: BlockSummary,
    candidates: Vec<CandidateResult>,
}

#[derive(Serialize)]
struct Report {
    schema_version: u32,
    family: u32,
    timing_note: &'static str,
    caches: Vec<CacheReport>,
    combined: CombinedReport,
}

#[derive(Serialize)]
struct CombinedReport {
    cache_count: usize,
    active_ssts: u64,
    original_complete_sst_bytes: u64,
    original_eligible_payload_bytes: u64,
    blocks: BlockSummary,
    candidates: Vec<CandidateResult>,
}

fn size_bucket(bytes: usize) -> &'static str {
    match bytes {
        0..=4095 => "<4KiB",
        4096..=16383 => "4-16KiB",
        16384..=65535 => "16-64KiB",
        65536..=1048575 => "64KiB-1MiB",
        _ => ">=1MiB",
    }
}

fn parse_args_from(args: impl IntoIterator<Item = OsString>) -> Result<Options> {
    let mut options = Options {
        family: 2,
        ..Default::default()
    };
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        match arg.to_str() {
            Some("--dictionary" | "-d") => options.dictionaries.push(PathBuf::from(
                args.next().context("--dictionary requires a path")?,
            )),
            Some("--json") => {
                options.json = Some(PathBuf::from(
                    args.next().context("--json requires a path")?,
                ));
            }
            Some("--family") => {
                let value = args.next().context("--family requires an integer")?;
                options.family = value
                    .to_str()
                    .context("--family must be UTF-8")?
                    .parse()
                    .context("--family must be an unsigned integer")?;
            }
            Some("--help" | "-h") => {
                print_help();
                std::process::exit(0);
            }
            Some(value) if value.starts_with('-') => bail!("Unknown option {value}"),
            _ => options.caches.push(PathBuf::from(arg)),
        }
    }
    ensure!(
        !options.caches.is_empty(),
        "At least one cache directory is required"
    );
    Ok(options)
}

fn parse_args() -> Result<Options> {
    parse_args_from(env::args_os().skip(1))
}

fn print_help() {
    println!(
        "Usage: taskdata_dictionary [OPTIONS] <CACHE_DIRECTORY>...\n\nEvaluate candidate zstd \
         dictionaries against active TaskData SST blocks.\n\nOptions:\n-d, --dictionary <PATH>  \
         Candidate dictionary (repeatable)\n--family <ID>       Family ID to evaluate (default: 2 \
         / TaskData)\n--json <PATH>       Write a JSON report\n-h, --help              Show this \
         help"
    );
}

fn make_candidates(paths: &[PathBuf]) -> Result<Vec<Candidate>> {
    let mut candidates = Vec::with_capacity(paths.len() + 1);
    let started = Instant::now();
    let compressor = zstd::bulk::Compressor::new(3)?;
    let decompressor = zstd::bulk::Decompressor::new()?;
    candidates.push(Candidate {
        info: DictionaryInfo {
            name: "zstd3 (no dictionary)".into(),
            path: None,
            bytes: 0,
            dictionary_id: None,
            xxh3_64: None,
        },
        compressor,
        decompressor,
        setup_ns: started.elapsed().as_nanos() as u64,
    });

    let mut names = BTreeSet::new();
    for path in paths {
        let dictionary = std::fs::read(path)
            .with_context(|| format!("Failed to read dictionary {}", path.display()))?;
        ensure!(
            !dictionary.is_empty(),
            "Dictionary {} is empty",
            path.display()
        );
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("dictionary")
            .to_owned();
        ensure!(
            names.insert(name.clone()),
            "Duplicate dictionary name {name}"
        );
        let started = Instant::now();
        let compressor = zstd::bulk::Compressor::with_dictionary(3, &dictionary)
            .with_context(|| format!("Failed to load dictionary {}", path.display()))?;
        let decompressor = zstd::bulk::Decompressor::with_dictionary(&dictionary)
            .with_context(|| format!("Failed to load dictionary {}", path.display()))?;
        let setup_ns = started.elapsed().as_nanos() as u64;
        candidates.push(Candidate {
            info: DictionaryInfo {
                name,
                path: Some(path.clone()),
                bytes: dictionary.len(),
                dictionary_id: zstd::zstd_safe::get_dict_id_from_dict(&dictionary)
                    .map(|id| id.get()),
                xxh3_64: Some(format!("{:016x}", xxh3_64(&dictionary))),
            },
            compressor,
            decompressor,
            setup_ns,
        });
    }
    Ok(candidates)
}

fn production_stored_size(original_len: usize, compressed_len: usize) -> (usize, bool) {
    if compressed_len < original_len - original_len / 8 {
        (compressed_len, true)
    } else {
        (original_len, false)
    }
}

fn evaluate_block(
    candidates: &mut [Candidate],
    results: &mut [CandidateResult],
    data: &[u8],
    was_compressed: bool,
) -> Result<()> {
    for (candidate, result) in candidates.iter_mut().zip(results) {
        let started = Instant::now();
        let compressed = candidate
            .compressor
            .compress(data)
            .with_context(|| format!("Failed to compress with {}", candidate.info.name))?;
        result.encode_ns += started.elapsed().as_nanos() as u64;

        let started = Instant::now();
        let decoded = candidate
            .decompressor
            .decompress(&compressed, data.len())
            .with_context(|| format!("Failed to decompress with {}", candidate.info.name))?;
        result.decode_ns += started.elapsed().as_nanos() as u64;
        ensure!(
            decoded == data,
            "Round trip mismatch with {}",
            candidate.info.name
        );

        result.raw_compressed_bytes += compressed.len() as u64;
        let (stored, compressed_decision) = production_stored_size(data.len(), compressed.len());
        result.modeled_payload_bytes += stored as u64;
        if compressed_decision {
            result.compressed_blocks += 1;
        } else {
            result.fallback_blocks += 1;
        }
        if compressed_decision && !was_compressed {
            result.became_compressed += 1;
        } else if !compressed_decision && was_compressed {
            result.became_uncompressed += 1;
        }
    }
    Ok(())
}

fn count_blob_references(header: KeyBlockHeader, data: &[u8]) -> Result<u64> {
    Ok(key_block_entry_types(header, data)?
        .into_iter()
        .filter(|&entry_type| entry_type == KEY_BLOCK_ENTRY_TYPE_BLOB)
        .count() as u64)
}

fn evaluate_cache(path: &Path, family: u32, candidates: &mut [Candidate]) -> Result<CacheReport> {
    ensure!(path.is_dir(), "Not a cache directory: {}", path.display());
    let families = collect_sst_info(path)
        .with_context(|| format!("Failed to inspect cache {}", path.display()))?;
    let ssts = families.get(&family).with_context(|| {
        format!(
            "Cache {} has no active SSTs for family {family}",
            path.display()
        )
    })?;

    let mut report = CacheReport {
        path: path.to_path_buf(),
        family,
        recorded_codecs: BTreeSet::new(),
        active_ssts: ssts.len() as u64,
        original_complete_sst_bytes: 0,
        original_eligible_payload_bytes: 0,
        blocks: BlockSummary::default(),
        candidates: candidates
            .iter()
            .map(|candidate| CandidateResult {
                dictionary: Some(candidate.info.clone()),
                setup_ns: candidate.setup_ns,
                ..Default::default()
            })
            .collect(),
    };

    for info in ssts {
        evaluate_sst(path, info, candidates, &mut report)
            .with_context(|| format!("Failed to evaluate {:08}.sst", info.sequence_number))?;
    }

    for result in &mut report.candidates {
        result.modeled_complete_sst_bytes = report.original_complete_sst_bytes
            - report.original_eligible_payload_bytes
            + result.modeled_payload_bytes;
    }
    finalize_results(
        &mut report.candidates,
        report.blocks.eligible_key.bytes + report.blocks.eligible_value.bytes,
        report.original_complete_sst_bytes,
    );
    Ok(report)
}

fn evaluate_sst(
    db_path: &Path,
    info: &SstInfo,
    candidates: &mut [Candidate],
    report: &mut CacheReport,
) -> Result<()> {
    ensure!(info.block_count > 0, "SST contains no blocks");
    let (mmap, file_size, offsets_start) = open_sst(db_path, info)?;
    report.original_complete_sst_bytes += file_size;
    report
        .recorded_codecs
        .insert(format!("{:?}", info.compression));

    let index_index = info.block_count - 1;
    let index = read_block(
        &mmap,
        offsets_start,
        index_index,
        info.sequence_number,
        info.compression,
    )?;
    let key_indices = parse_key_block_indices(&index.data)?;
    report.blocks.excluded_index.add(index.data.len());

    for block_index in 0..index_index {
        let block = read_block(
            &mmap,
            offsets_start,
            block_index,
            info.sequence_number,
            info.compression,
        )?;
        let eligible = if key_indices.contains(&block_index) {
            let header = parse_key_block_header(&block.data).with_context(|| {
                format!(
                    "Invalid key block {block_index} in {:08}.sst",
                    info.sequence_number
                )
            })?;
            report.blocks.blob_references += count_blob_references(header, &block.data)?;
            if max_key_length(header, &block.data)? >= MIN_KEY_SIZE_FOR_COMPRESSION {
                report.blocks.eligible_key.add(block.data.len());
                true
            } else {
                report.blocks.excluded_key.add(block.data.len());
                false
            }
        } else {
            report.blocks.eligible_value.add(block.data.len());
            true
        };
        if eligible {
            report.blocks.add_eligible_size(block.data.len());
            report.original_eligible_payload_bytes += block.stored_size;
            evaluate_block(
                candidates,
                &mut report.candidates,
                &block.data,
                block.was_compressed,
            )?;
        }
    }

    let modeled_fixed_bytes =
        info.block_count as u64 * (BLOCK_HEADER_SIZE as u64 + size_of::<u32>() as u64);
    ensure!(
        file_size >= modeled_fixed_bytes,
        "SST is smaller than its headers and block directory"
    );
    Ok(())
}

fn percentage_delta(value: u64, baseline: u64) -> Option<f64> {
    (baseline > 0).then(|| (value as f64 / baseline as f64 - 1.0) * 100.0)
}

fn finalize_results(results: &mut [CandidateResult], uncompressed_bytes: u64, current_bytes: u64) {
    let baseline = results
        .first()
        .map_or(0, |result| result.modeled_complete_sst_bytes);
    for result in results {
        result.raw_compression_ratio = (uncompressed_bytes > 0)
            .then(|| result.raw_compressed_bytes as f64 / uncompressed_bytes as f64);
        result.modeled_delta_vs_baseline_pct =
            percentage_delta(result.modeled_complete_sst_bytes, baseline);
        result.modeled_delta_vs_current_pct =
            percentage_delta(result.modeled_complete_sst_bytes, current_bytes);
    }
}

fn combine(caches: &[CacheReport], candidates: &[Candidate]) -> CombinedReport {
    let mut combined = CombinedReport {
        cache_count: caches.len(),
        active_ssts: 0,
        original_complete_sst_bytes: 0,
        original_eligible_payload_bytes: 0,
        blocks: BlockSummary::default(),
        candidates: candidates
            .iter()
            .map(|candidate| CandidateResult {
                dictionary: Some(candidate.info.clone()),
                setup_ns: candidate.setup_ns,
                ..Default::default()
            })
            .collect(),
    };
    for cache in caches {
        combined.active_ssts += cache.active_ssts;
        combined.original_complete_sst_bytes += cache.original_complete_sst_bytes;
        combined.original_eligible_payload_bytes += cache.original_eligible_payload_bytes;
        combined.blocks.merge(&cache.blocks);
        for (total, result) in combined.candidates.iter_mut().zip(&cache.candidates) {
            total.merge(result);
        }
    }
    finalize_results(
        &mut combined.candidates,
        combined.blocks.eligible_key.bytes + combined.blocks.eligible_value.bytes,
        combined.original_complete_sst_bytes,
    );
    combined
}

fn print_report(report: &Report) {
    for cache in &report.caches {
        println!(
            "Cache {}: {} SSTs, {} bytes; eligible {} key + {} value blocks; blobs omitted {}",
            cache.path.display(),
            cache.active_ssts,
            cache.original_complete_sst_bytes,
            cache.blocks.eligible_key.count,
            cache.blocks.eligible_value.count,
            cache.blocks.blob_references,
        );
        let baseline = cache.candidates[0].modeled_complete_sst_bytes;
        for result in &cache.candidates {
            let name = &result.dictionary.as_ref().unwrap().name;
            let delta = if baseline == 0 {
                0.0
            } else {
                (result.modeled_complete_sst_bytes as f64 / baseline as f64 - 1.0) * 100.0
            };
            println!(
                "  {name}: modeled SST {} bytes ({delta:+.2}% vs baseline)",
                result.modeled_complete_sst_bytes
            );
        }
    }
    println!();
    println!(
        "Combined family {}: {} cache directories, {} active SSTs",
        report.family,
        report.caches.len(),
        report.combined.active_ssts
    );
    println!(
        "Eligible: {} key + {} value blocks, {} bytes uncompressed; blobs omitted: {}",
        report.combined.blocks.eligible_key.count,
        report.combined.blocks.eligible_value.count,
        report.combined.blocks.eligible_key.bytes + report.combined.blocks.eligible_value.bytes,
        report.combined.blocks.blob_references
    );
    println!(
        "Original active SST bytes: {}",
        report.combined.original_complete_sst_bytes
    );
    println!();
    println!(
        "{:<28} {:>15} {:>9} {:>15} {:>10} {:>12} {:>12}",
        "Candidate",
        "Raw compressed",
        "ratio",
        "Modeled SST",
        "vs baseline",
        "encode ms",
        "decode ms"
    );
    let baseline = report.combined.candidates[0].modeled_complete_sst_bytes;
    for result in &report.combined.candidates {
        let name = &result.dictionary.as_ref().unwrap().name;
        let delta = if baseline == 0 {
            0.0
        } else {
            (result.modeled_complete_sst_bytes as f64 / baseline as f64 - 1.0) * 100.0
        };
        println!(
            "{name:<28} {:>15} {:>8.2}% {:>15} {:>+9.2}% {:>12.3} {:>12.3}",
            result.raw_compressed_bytes,
            result.raw_compression_ratio.unwrap_or_default() * 100.0,
            result.modeled_complete_sst_bytes,
            delta,
            result.encode_ns as f64 / 1_000_000.0,
            result.decode_ns as f64 / 1_000_000.0,
        );
    }
    println!();
    println!("Note: timings are single-pass wall-clock diagnostics, not benchmarks.");
}

fn run() -> Result<()> {
    let options = parse_args()?;
    let mut candidates = make_candidates(&options.dictionaries)?;
    let mut caches = Vec::with_capacity(options.caches.len());
    for path in &options.caches {
        caches.push(evaluate_cache(path, options.family, &mut candidates)?);
    }
    let combined = combine(&caches, &candidates);
    let report = Report {
        schema_version: SCHEMA_VERSION,
        family: options.family,
        timing_note: "Single-pass wall-clock diagnostics; size/count fields are the comparison \
                      contract.",
        caches,
        combined,
    };
    print_report(&report);
    if let Some(path) = options.json {
        let file = File::create(&path)
            .with_context(|| format!("Failed to create JSON report {}", path.display()))?;
        serde_json::to_writer_pretty(BufWriter::new(file), &report)?;
    }
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("Error: {error:#}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    use anyhow::Result;
    use byteorder::{BE, WriteBytesExt};
    use tempfile::TempDir;
    use turbo_persistence::{Compression, DbConfig, SerialScheduler, TurboPersistence};

    use super::{evaluate_cache, make_candidates, parse_args_from, production_stored_size};

    fn make_cache(family: usize, compression: Compression) -> Result<TempDir> {
        let tempdir = tempfile::tempdir()?;
        let mut config = DbConfig::<8>::default();
        config.family_configs[family].compression = compression;
        let db = TurboPersistence::<SerialScheduler, 8>::open_with_config(
            tempdir.path().to_path_buf(),
            config,
        )?;
        let batch = db.write_batch()?;
        for index in 0..50u8 {
            let key = format!("long-task-data-key-{index:04}").into_bytes();
            let value = format!("function component{index}() {{ return null; }}")
                .repeat(32)
                .into_bytes();
            batch.put(family as u32, key, value.into())?;
        }
        for index in 0..4u8 {
            let key = format!("long-medium-task-data-key-{index:04}").into_bytes();
            batch.put(family as u32, key, vec![b'a' + index; 5000].into())?;
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
            b"long-incompressible-task-data-key".to_vec(),
            incompressible.into(),
        )?;
        db.commit_write_batch(batch)?;
        db.shutdown()?;
        Ok(tempdir)
    }

    fn write_dictionary(path: &Path, byte: u8) -> Result<()> {
        let mut dictionary = b"function component return const import export className".repeat(32);
        dictionary.push(byte);
        fs::write(path, dictionary)?;
        Ok(())
    }

    #[test]
    fn cli_requires_cache_and_rejects_unknown_options() {
        assert!(parse_args_from([]).is_err());
        assert!(parse_args_from(["--unknown".into()]).is_err());
        let options = parse_args_from([
            "--family".into(),
            "7".into(),
            "--dictionary".into(),
            "candidate.dict".into(),
            "cache".into(),
        ])
        .unwrap();
        assert_eq!(options.family, 7);
        assert_eq!(
            options.dictionaries,
            [std::path::PathBuf::from("candidate.dict")]
        );
        assert_eq!(options.caches, [std::path::PathBuf::from("cache")]);
    }

    #[test]
    fn production_threshold_is_strict() {
        assert_eq!(production_stored_size(800, 699), (699, true));
        assert_eq!(production_stored_size(800, 700), (800, false));
    }

    #[test]
    fn evaluates_multiple_dictionaries_without_mutating_cache() -> Result<()> {
        let cache = make_cache(2, Compression::Zstd3)?;
        let dictionary_dir = tempfile::tempdir()?;
        let first = dictionary_dir.path().join("first.dict");
        let second = dictionary_dir.path().join("second.dict");
        write_dictionary(&first, 1)?;
        write_dictionary(&second, 2)?;
        let before = fs::read(cache.path().join("00000001.sst"))?;

        let mut candidates = make_candidates(&[first, second])?;
        let report = evaluate_cache(cache.path(), 2, &mut candidates)?;

        assert_eq!(report.active_ssts, 1);
        assert_eq!(report.candidates.len(), 3);
        assert!(report.blocks.eligible_value.count > 0);
        assert!(report.blocks.eligible_key.count > 0);
        assert_eq!(report.blocks.excluded_index.count, 1);
        assert_eq!(report.blocks.blob_references, 0);
        assert_eq!(
            report.candidates[0].modeled_complete_sst_bytes,
            report.original_complete_sst_bytes
        );
        assert!(report.candidates[0].fallback_blocks > 0);
        assert!(
            report
                .candidates
                .iter()
                .all(|candidate| candidate.modeled_complete_sst_bytes > 0)
        );

        let mut repeated_candidates = make_candidates(&[
            dictionary_dir.path().join("first.dict"),
            dictionary_dir.path().join("second.dict"),
        ])?;
        let repeated = evaluate_cache(cache.path(), 2, &mut repeated_candidates)?;
        assert_eq!(
            report.original_complete_sst_bytes,
            repeated.original_complete_sst_bytes
        );
        assert_eq!(
            report.blocks.eligible_key.count,
            repeated.blocks.eligible_key.count
        );
        assert_eq!(
            report.blocks.eligible_value.count,
            repeated.blocks.eligible_value.count
        );
        assert_eq!(
            report
                .candidates
                .iter()
                .map(|candidate| candidate.modeled_complete_sst_bytes)
                .collect::<Vec<_>>(),
            repeated
                .candidates
                .iter()
                .map(|candidate| candidate.modeled_complete_sst_bytes)
                .collect::<Vec<_>>()
        );
        assert_eq!(before, fs::read(cache.path().join("00000001.sst"))?);
        Ok(())
    }

    #[test]
    fn counts_blob_references_in_key_blocks() -> Result<()> {
        use turbo_persistence::{
            offline::parse_key_block_header,
            static_sorted_file::{BLOCK_TYPE_FIXED_KEY_NO_HASH, KEY_BLOCK_ENTRY_TYPE_BLOB},
        };

        let block = [
            BLOCK_TYPE_FIXED_KEY_NO_HASH,
            0,
            0,
            1,
            1,
            KEY_BLOCK_ENTRY_TYPE_BLOB,
            b'k',
            0,
            0,
            0,
            42,
        ];
        let header = parse_key_block_header(&block)?;
        assert_eq!(super::count_blob_references(header, &block)?, 1);
        Ok(())
    }

    #[test]
    fn corrupt_blocks_are_rejected_with_context() -> Result<()> {
        let cache = make_cache(2, Compression::Zstd3)?;
        let sst_path = cache.path().join("00000001.sst");
        let mut bytes = fs::read(&sst_path)?;
        bytes[8] ^= 1;
        fs::write(&sst_path, bytes)?;
        let mut candidates = make_candidates(&[])?;
        let error = evaluate_cache(cache.path(), 2, &mut candidates)
            .err()
            .expect("corrupt block should fail");
        let message = format!("{error:#}");
        assert!(message.contains("00000001.sst"));
        assert!(message.contains("Checksum mismatch"));
        Ok(())
    }

    #[test]
    fn active_ssts_follow_current_deletions_and_supersession() -> Result<()> {
        let cache = make_cache(2, Compression::Zstd3)?;
        fs::copy(
            cache.path().join("00000002.meta"),
            cache.path().join("00000003.meta"),
        )?;
        let mut current: serde_json::Value =
            serde_json::from_slice(&fs::read(cache.path().join("CURRENT"))?)?;
        current["max_sequence_number"] = 3.into();
        fs::write(cache.path().join("CURRENT"), serde_json::to_vec(&current)?)?;

        let mut candidates = make_candidates(&[])?;
        let superseded = evaluate_cache(cache.path(), 2, &mut candidates)?;
        assert_eq!(superseded.active_ssts, 1);

        let mut deletion = Vec::new();
        deletion.write_u32::<BE>(3)?;
        fs::write(cache.path().join("00000004.del"), deletion)?;
        let mut candidates = make_candidates(&[])?;
        let deleted = evaluate_cache(cache.path(), 2, &mut candidates)?;
        assert_eq!(deleted.active_ssts, 1);
        assert_eq!(
            superseded.original_complete_sst_bytes,
            deleted.original_complete_sst_bytes
        );
        Ok(())
    }

    #[test]
    fn family_override_selects_non_taskdata_family() -> Result<()> {
        let cache = make_cache(7, Compression::Lz4)?;
        let mut candidates = make_candidates(&[])?;
        let report = evaluate_cache(cache.path(), 7, &mut candidates)?;
        assert_eq!(report.family, 7);
        assert_eq!(report.recorded_codecs, ["Lz4".to_string()].into());
        assert!(report.blocks.eligible_value.count > 0);
        Ok(())
    }
}
