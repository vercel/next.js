//! Analyzes the compactions recorded in a database's `LOG` file.
//!
//! The database state (which SST files are live, per family) is reconstructed by replaying the
//! commits in the log. For every compaction this reports how many bytes were rewritten and how
//! much that reduced the overlap of the SST files. With `--replay`, the current compaction
//! selector is also run against each state a compaction started from, to see what it would have
//! done instead. Replays don't feed back into later states, so they only compare single decisions.
//!
//! Usage: `compaction_log <db dir or LOG file> [--replay] [--segments N] [--target-overlap X]
//! [--min-reclaim-mb N] [--events] [--validate]`

use std::{
    collections::{BTreeMap, HashMap, HashSet},
    ops::RangeInclusive,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result, bail};
use smallvec::SmallVec;
use turbo_persistence::{
    CompactConfig, Compactable, meta_file::MetaFile, plan_compaction, read_current_version,
    shard::shard_count_for, sst_filter::SstFilter,
};

const MB: u64 = 1024 * 1024;

#[derive(Clone, Debug)]
struct Sst {
    seq: u32,
    min: u64,
    max: u64,
    size: u64,
    fresh: bool,
    bottom: bool,
    entries: u64,
    tombstones: u64,
}

impl Compactable for Sst {
    fn range(&self) -> RangeInclusive<u64> {
        self.min..=self.max
    }

    fn size(&self) -> u64 {
        self.size
    }

    fn entry_count(&self) -> u64 {
        self.entries
    }

    fn tombstone_count(&self) -> u64 {
        self.tombstones
    }

    fn is_fresh(&self) -> bool {
        self.fresh
    }

    fn is_bottom(&self) -> bool {
        self.bottom
    }
}

struct Meta {
    seq: u32,
    family: u32,
    ssts: Vec<Sst>,
}

/// The live SST files, reconstructed from the log.
#[derive(Default)]
struct State {
    /// All meta files in commit order, which is the order they are read in.
    metas: Vec<Meta>,
}

impl State {
    /// The live SST files of a family in the order the database reads (and compacts) them.
    fn family(&self, family: u32) -> Vec<Sst> {
        self.metas
            .iter()
            .filter(|m| m.family == family)
            .flat_map(|m| m.ssts.iter().cloned())
            .collect()
    }

    fn find(&self, family: u32, seq: u32) -> Option<&Sst> {
        self.metas
            .iter()
            .filter(|m| m.family == family)
            .flat_map(|m| m.ssts.iter())
            .find(|s| s.seq == seq)
    }

    fn families(&self) -> Vec<u32> {
        let mut families = self.metas.iter().map(|m| m.family).collect::<Vec<_>>();
        families.sort_unstable();
        families.dedup();
        families
    }

    /// Applies a commit. SST files listed by a newer meta file (as live or obsolete) shadow the
    /// same SST files in older meta files, like `SstFilter` does when opening the database.
    fn apply(&mut self, commit: &Commit) {
        for new_meta in &commit.metas {
            let shadowed = new_meta
                .ssts
                .iter()
                .map(|s| s.seq)
                .chain(new_meta.obsolete.iter().copied())
                .collect::<HashSet<_>>();
            for meta in self.metas.iter_mut() {
                if meta.family == new_meta.family {
                    meta.ssts.retain(|s| !shadowed.contains(&s.seq));
                }
            }
            self.metas.push(Meta {
                seq: new_meta.seq,
                family: new_meta.family,
                ssts: new_meta.ssts.clone(),
            });
        }
        let deleted = commit.deleted_metas.iter().collect::<HashSet<_>>();
        for meta in &self.metas {
            if deleted.contains(&meta.seq) && !meta.ssts.is_empty() {
                eprintln!(
                    "warning: commit {:08} deletes meta file {:08} which still has {} live SST \
                     files in the reconstructed state",
                    commit.seq,
                    meta.seq,
                    meta.ssts.len()
                );
            }
        }
        self.metas
            .retain(|m| !deleted.contains(&m.seq) && !m.ssts.is_empty());
    }
}

#[derive(Default)]
struct NewMeta {
    seq: u32,
    family: u32,
    ssts: Vec<Sst>,
    obsolete: Vec<u32>,
}

#[derive(Default)]
struct Commit {
    seq: u32,
    time: String,
    metas: Vec<NewMeta>,
    deleted_metas: Vec<u32>,
}

impl Commit {
    fn meta(&mut self, family: u32, seq: u32) -> &mut NewMeta {
        if let Some(i) = self.metas.iter().position(|m| m.seq == seq) {
            return &mut self.metas[i];
        }
        self.metas.push(NewMeta {
            seq,
            family,
            ..Default::default()
        });
        self.metas.last_mut().unwrap()
    }
}

#[derive(Default, Clone)]
struct Merge {
    inputs: Vec<u32>,
    outputs: Vec<u32>,
}

/// The merges of one family in one compaction.
#[derive(Default)]
struct FamilyCompaction {
    merges: Vec<Merge>,
}

enum Record {
    /// A commit of new data.
    Write(Commit),
    /// A compaction and the commit of its results.
    Compaction(BTreeMap<u32, FamilyCompaction>, Commit),
}

fn parse_seq(s: &str) -> Option<u32> {
    s.trim().parse().ok()
}

/// Parses `<min>-<max> (<n> MiB, <flags>[, <n> bytes, <n> entries, <n> tombstones])`.
fn parse_sst(seq: u32, rest: &str) -> Result<Sst> {
    let (range, info) = rest.split_once(" (").context("missing SST info")?;
    let (min, max) = range.trim().split_once('-').context("invalid range")?;
    let info = info.trim_end_matches(')');
    let fields = info.split(", ").collect::<Vec<_>>();
    let field = |suffix: &str| {
        fields
            .iter()
            .find_map(|f| f.strip_suffix(suffix))
            .and_then(|n| n.parse::<u64>().ok())
    };
    let size = field(" bytes")
        .or_else(|| field(" MiB").map(|mib| mib * MB))
        .context("missing SST size")?;
    Ok(Sst {
        seq,
        min: u64::from_str_radix(min, 16)?,
        max: u64::from_str_radix(max, 16)?,
        size,
        fresh: fields.contains(&"fresh"),
        bottom: fields.contains(&"bottom"),
        entries: field(" entries").unwrap_or(0),
        tombstones: field(" tombstones").unwrap_or(0),
    })
}

fn parse_log(content: &str) -> Result<Vec<Record>> {
    let mut records = Vec::new();
    let mut compaction: Option<BTreeMap<u32, FamilyCompaction>> = None;
    let mut commit: Option<Commit> = None;
    let mut time = String::new();
    let mut finish =
        |commit: &mut Option<Commit>, compaction: &mut Option<BTreeMap<u32, FamilyCompaction>>| {
            if let Some(commit) = commit.take() {
                records.push(match compaction.take() {
                    Some(compaction) => Record::Compaction(compaction, commit),
                    None => Record::Write(commit),
                });
            }
        };
    for (line_number, line) in content.lines().enumerate() {
        let context = || format!("line {}: {line}", line_number + 1);
        if let Some(t) = line.strip_prefix("Time ") {
            finish(&mut commit, &mut compaction);
            time = t.to_string();
            continue;
        }
        if let Some(rest) = line.strip_prefix("Commit ") {
            let seq = rest
                .split_whitespace()
                .next()
                .and_then(parse_seq)
                .with_context(context)?;
            commit = Some(Commit {
                seq,
                time: time.clone(),
                ..Default::default()
            });
            continue;
        }
        let parts = line.split(" | ").collect::<Vec<_>>();
        if parts.len() < 3 {
            continue;
        }
        let Ok(family) = parts[0].trim().parse::<u32>() else {
            // `    |          | <seqs> <label>` lines.
            if let Some(seqs) = line.strip_suffix(" META DELETED")
                && let Some(commit) = commit.as_mut()
            {
                let seqs = seqs.rsplit('|').next().unwrap_or_default();
                commit
                    .deleted_metas
                    .extend(seqs.split_whitespace().filter_map(parse_seq));
            }
            continue;
        };
        let meta_seq = parse_seq(parts[1]).with_context(context)?;
        let item = parts[2];
        if item == "Compaction:" {
            // A compaction starts before its commit, so any open commit is complete.
            finish(&mut commit, &mut compaction);
            compaction
                .get_or_insert_default()
                .entry(family)
                .or_default();
            continue;
        }
        if item.starts_with("MERGE (") {
            let compaction = compaction.as_mut().with_context(context)?;
            compaction
                .entry(family)
                .or_default()
                .merges
                .push(Merge::default());
            continue;
        }
        if let Some(seqs) = item.strip_suffix(" OBSOLETE SST") {
            let commit = commit.as_mut().with_context(context)?;
            commit
                .meta(family, meta_seq)
                .obsolete
                .extend(seqs.split_whitespace().filter_map(parse_seq));
            continue;
        }
        let Some((seq, kind)) = item.split_once(' ') else {
            continue;
        };
        let seq = parse_seq(seq).with_context(context)?;
        match kind.trim() {
            "SST" => {
                let commit = commit.as_mut().with_context(context)?;
                let sst =
                    parse_sst(seq, parts.get(4).with_context(context)?).with_context(context)?;
                commit.meta(family, meta_seq).ssts.push(sst);
            }
            kind @ ("INPUT" | "OUTPUT") => {
                let compaction = compaction.as_mut().with_context(context)?;
                let merge = compaction
                    .entry(family)
                    .or_default()
                    .merges
                    .last_mut()
                    .with_context(context)?;
                if kind == "INPUT" {
                    merge.inputs.push(seq);
                } else {
                    merge.outputs.push(seq);
                }
            }
            _ => {}
        }
    }
    finish(&mut commit, &mut compaction);
    Ok(records)
}

/// The expected number of SST files whose range contains a key, for a key of the covered key
/// space. Logs written while compaction split warm and cold files count both, as lookups consult
/// both.
fn overlap(ssts: &[Sst]) -> f32 {
    let total = ssts
        .iter()
        .map(|s| u128::from(s.max - s.min) + 1)
        .sum::<u128>();
    let mut ranges = ssts.iter().map(|s| (s.min, s.max)).collect::<Vec<_>>();
    ranges.sort_unstable();
    let mut covered = 0u128;
    let mut current: Option<(u64, u64)> = None;
    for (min, max) in ranges {
        match &mut current {
            Some((_, end)) if min <= *end => *end = (*end).max(max),
            _ => {
                if let Some((start, end)) = current {
                    covered += u128::from(end - start) + 1;
                }
                current = Some((min, max));
            }
        }
    }
    if let Some((start, end)) = current {
        covered += u128::from(end - start) + 1;
    }
    if covered == 0 {
        0.0
    } else {
        (total as f64 / covered as f64) as f32
    }
}

fn fmt_overlap(overlap: f32) -> String {
    format!("{overlap:5.2}")
}

/// Estimates the state after running the merge segments: each merge writes one run of files over
/// the range of its inputs. This is the same estimate the selector uses.
fn estimate_after(ssts: &[Sst], segments: &[SmallVec<[usize; 1]>]) -> Vec<Sst> {
    let mut merged = vec![false; ssts.len()];
    let mut outputs = Vec::new();
    for segment in segments.iter().filter(|s| s.len() > 1) {
        let inputs = segment.iter().map(|&i| &ssts[i]).collect::<Vec<_>>();
        outputs.push(Sst {
            seq: u32::MAX,
            min: inputs.iter().map(|s| s.min).min().unwrap(),
            max: inputs.iter().map(|s| s.max).max().unwrap(),
            size: inputs.iter().map(|s| s.size).sum(),
            fresh: false,
            bottom: false,
            entries: 0,
            tombstones: 0,
        });
        for &i in segment {
            merged[i] = true;
        }
    }
    ssts.iter()
        .zip(merged)
        .filter(|(_, merged)| !merged)
        .map(|(s, _)| s.clone())
        .chain(outputs)
        .collect()
}

fn family_name(family: u32) -> &'static str {
    match family {
        0 => "Infra",
        1 => "TaskMeta",
        2 => "TaskData",
        3 => "TaskCache",
        _ => "Unknown",
    }
}

fn mb(bytes: u64) -> f64 {
    bytes as f64 / MB as f64
}

#[derive(Default)]
struct FamilyTotals {
    written: u64,
    compactions: usize,
    merges: usize,
    merged_files: usize,
    rewritten: u64,
    output: u64,
    /// Sum of the overlap after each compaction, to average the overlap builds start with.
    overlap_after_sum: f64,
    overlap_after_count: usize,
    /// The estimated overlap after the actual merges, to check the estimate against the actual
    /// overlap after.
    estimated_after_sum: f64,
    overlap_after_family_sum: f64,
    compacted_count: usize,
    replay_compactions: usize,
    replay_merges: usize,
    replay_rewritten: u64,
    replay_overlap_after_sum: f64,
    replay_overlap_after_count: usize,
}

/// A replayed selector decision for one family.
struct Replay {
    merges: usize,
    files: usize,
    rewritten: u64,
    estimated_after: f32,
}

/// The shard settings of the database, matching turbo-tasks-backend by default.
struct ShardConfig {
    target_shard_size: u64,
    min_shard_counts: Vec<u32>,
}

impl ShardConfig {
    fn shard_count(&self, family: u32, ssts: &[Sst]) -> u32 {
        let bottom_bytes = ssts.iter().filter(|s| s.bottom).map(|s| s.size).sum();
        let min = self
            .min_shard_counts
            .get(family as usize)
            .copied()
            .unwrap_or(1);
        shard_count_for(bottom_bytes, self.target_shard_size, min)
    }
}

fn replay(state: &State, config: &CompactConfig, shards: &ShardConfig) -> BTreeMap<u32, Replay> {
    let families = state.families();
    let ssts = families
        .iter()
        .map(|&f| state.family(f))
        .collect::<Vec<_>>();
    let planned = plan_compaction(
        &families
            .iter()
            .zip(&ssts)
            .map(|(&family, ssts)| (&ssts[..], shards.shard_count(family, ssts)))
            .collect::<Vec<_>>(),
        config,
    );
    families
        .iter()
        .zip(ssts.iter().zip(planned))
        .map(|(&family, (ssts, jobs))| {
            let segments = jobs.into_iter().map(|job| job.members).collect::<Vec<_>>();
            let merges = segments.iter().filter(|s| s.len() > 1).collect::<Vec<_>>();
            let replay = Replay {
                merges: merges.len(),
                files: merges.iter().map(|s| s.len()).sum(),
                rewritten: merges
                    .iter()
                    .flat_map(|s| s.iter())
                    .map(|&i| ssts[i].size)
                    .sum(),
                estimated_after: overlap(&estimate_after(ssts, &segments)),
            };
            (family, replay)
        })
        .collect()
}

/// Compares the reconstructed state with the meta files in the database directory.
fn validate(state: &State, db_path: &Path) -> Result<()> {
    let current = read_current_version(db_path)?
        .context("CURRENT file is missing")?
        .max_sequence_number;
    let mut meta_seqs = fs_err::read_dir(db_path)?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let path = e.path();
            if path.extension()? != "meta" {
                return None;
            }
            let seq: u32 = path.file_stem()?.to_str()?.parse().ok()?;
            (seq <= current).then_some(seq)
        })
        .collect::<Vec<_>>();
    meta_seqs.sort_unstable();
    let mut metas = meta_seqs
        .iter()
        .map(|&seq| MetaFile::open(db_path, seq, None, turbo_persistence::AccessMode::File))
        .collect::<Result<Vec<_>>>()?;
    let mut filter = SstFilter::new();
    for meta in metas.iter_mut().rev() {
        filter.apply_filter(meta);
    }
    let mut mismatches = 0;
    for family in state.families() {
        let actual = metas
            .iter()
            .filter(|m| m.family() == family)
            .flat_map(|m| m.entries().iter().map(|e| (e.sequence_number(), e.size())))
            .collect::<Vec<_>>();
        let expected = state
            .family(family)
            .iter()
            .map(|s| (s.seq, s.size))
            .collect::<Vec<_>>();
        if actual != expected {
            mismatches += 1;
            let a = actual.iter().map(|(s, _)| *s).collect::<HashSet<_>>();
            let e = expected.iter().map(|(s, _)| *s).collect::<HashSet<_>>();
            eprintln!(
                "family {family}: reconstructed {} SST files, database has {} ({} missing, {} \
                 extra, order or size differs otherwise)",
                expected.len(),
                actual.len(),
                a.difference(&e).count(),
                e.difference(&a).count()
            );
        }
    }
    if mismatches > 0 {
        bail!("reconstructed state doesn't match {}", db_path.display());
    }
    println!("Reconstructed state matches the database.\n");
    Ok(())
}

fn main() -> Result<()> {
    let mut args = std::env::args().skip(1);
    let mut path: Option<PathBuf> = None;
    let mut replay_enabled = false;
    let mut print_events = false;
    let mut validate_db = false;
    let mut config = CompactConfig {
        // Matches `COMPACT_CONFIG` in turbo-tasks-backend.
        max_space_amplification: 0.5,
        max_files_above_bottom: 4,
        max_rewrite_factor: 2.0,
        // Matches compaction on shutdown: one merge job per core.
        max_merge_segment_count: std::thread::available_parallelism().map_or(4, |c| c.get().max(4)),
    };
    let mut shards = ShardConfig {
        target_shard_size: 256 * MB,
        // Infra, TaskMeta, TaskData, TaskCache
        min_shard_counts: vec![1, 4, 8, 1],
    };
    while let Some(arg) = args.next() {
        let mut value = || args.next().context("missing value");
        match arg.as_str() {
            "--replay" => replay_enabled = true,
            "--events" => print_events = true,
            "--validate" => validate_db = true,
            "--segments" => config.max_merge_segment_count = value()?.parse()?,
            "--space-amp" => config.max_space_amplification = value()?.parse()?,
            "--max-files-above-bottom" => config.max_files_above_bottom = value()?.parse()?,
            "--rewrite-factor" => config.max_rewrite_factor = value()?.parse()?,
            "--target-shard-mb" => shards.target_shard_size = value()?.parse::<u64>()? * MB,
            "--min-shards" => {
                shards.min_shard_counts = value()?
                    .split(',')
                    .map(|n| n.parse())
                    .collect::<Result<_, _>>()?
            }
            _ if !arg.starts_with('-') => path = Some(arg.into()),
            _ => bail!("unknown argument {arg}"),
        }
    }
    let path = path.context(
        "usage: compaction_log <db dir or LOG> [--replay] [--events] [--validate] [--segments N] \
         [--space-amp X] [--max-files-above-bottom N] [--rewrite-factor X] [--target-shard-mb N] \
         [--min-shards A,B,C,D]",
    )?;
    let (log_path, db_path) = if path.is_dir() {
        (path.join("LOG"), Some(path))
    } else {
        (path.clone(), path.parent().map(Path::to_path_buf))
    };
    let records = parse_log(&fs_err::read_to_string(&log_path)?)?;

    let mut state = State::default();
    let mut totals: BTreeMap<u32, FamilyTotals> = BTreeMap::new();
    let mut compaction_count = 0;
    if print_events {
        println!(
            "Per compaction and family: files merged, MB rewritten -> written, overlap before -> \
             after{}",
            if replay_enabled {
                "; then what the current selector would do"
            } else {
                ""
            }
        );
    }
    for record in &records {
        match record {
            Record::Write(commit) => {
                for meta in &commit.metas {
                    totals.entry(meta.family).or_default().written +=
                        meta.ssts.iter().map(|s| s.size).sum::<u64>();
                }
                state.apply(commit);
            }
            Record::Compaction(compaction, commit) => {
                compaction_count += 1;
                let before = compaction
                    .keys()
                    .map(|&f| (f, state.family(f)))
                    .collect::<HashMap<_, _>>();
                let replayed = replay_enabled.then(|| replay(&state, &config, &shards));
                let estimated = compaction
                    .iter()
                    .map(|(&family, c)| {
                        let ssts = &before[&family];
                        let segments = c
                            .merges
                            .iter()
                            .filter(|m| m.inputs.len() > 1)
                            .map(|m| {
                                m.inputs
                                    .iter()
                                    .filter_map(|seq| ssts.iter().position(|s| s.seq == *seq))
                                    .collect::<SmallVec<[usize; 1]>>()
                            })
                            .collect::<Vec<_>>();
                        (family, overlap(&estimate_after(ssts, &segments)))
                    })
                    .collect::<HashMap<_, _>>();
                let inputs = compaction
                    .iter()
                    .map(|(&family, c)| {
                        let merges = c.merges.iter().filter(|m| m.inputs.len() > 1);
                        let files = merges.clone().map(|m| m.inputs.len()).sum::<usize>();
                        let bytes = merges
                            .flat_map(|m| m.inputs.iter())
                            .map(|&seq| state.find(family, seq).map_or(0, |s| s.size))
                            .sum::<u64>();
                        (family, (files, bytes))
                    })
                    .collect::<HashMap<_, _>>();
                state.apply(commit);
                for (&family, c) in compaction {
                    let merges = c.merges.iter().filter(|m| m.inputs.len() > 1).count();
                    let (files, rewritten) = inputs[&family];
                    let output = c
                        .merges
                        .iter()
                        .flat_map(|m| m.outputs.iter())
                        .map(|&seq| state.find(family, seq).map_or(0, |s| s.size))
                        .sum::<u64>();
                    let after = overlap(&state.family(family));
                    let t = totals.entry(family).or_default();
                    if merges > 0 {
                        t.compactions += 1;
                        let estimated = estimated[&family];
                        t.estimated_after_sum += f64::from(estimated);
                        t.overlap_after_family_sum += f64::from(after);
                        t.compacted_count += 1;
                    }
                    t.merges += merges;
                    t.merged_files += files;
                    t.rewritten += rewritten;
                    t.output += output;
                    if print_events {
                        println!(
                            "#{compaction_count:<3} {} {:<9} {files:>3} files {:>8.1} -> {:>8.1} \
                             MB  overlap {} -> {}",
                            commit.time.get(..19).unwrap_or(&commit.time),
                            family_name(family),
                            mb(rewritten),
                            mb(output),
                            fmt_overlap(overlap(&before[&family])),
                            fmt_overlap(after),
                        );
                    }
                }
                for family in state.families() {
                    let after = overlap(&state.family(family));
                    let t = totals.entry(family).or_default();
                    t.overlap_after_sum += f64::from(after);
                    t.overlap_after_count += 1;
                }
                if let Some(replayed) = replayed {
                    for (family, r) in replayed {
                        let t = totals.entry(family).or_default();
                        if r.merges > 0 {
                            t.replay_compactions += 1;
                        }
                        t.replay_merges += r.merges;
                        t.replay_rewritten += r.rewritten;
                        t.replay_overlap_after_sum += f64::from(r.estimated_after);
                        t.replay_overlap_after_count += 1;
                        if print_events && (r.merges > 0 || compaction.contains_key(&family)) {
                            println!(
                                "     replay {:<9} {:>3} files {:>8.1} MB in {} jobs, estimated \
                                 overlap after {}",
                                family_name(family),
                                r.files,
                                mb(r.rewritten),
                                r.merges,
                                fmt_overlap(r.estimated_after),
                            );
                        }
                    }
                }
            }
        }
    }
    if print_events {
        println!();
    }

    if validate_db {
        validate(&state, db_path.as_deref().context("no database directory")?)?;
    }

    let writes = records
        .iter()
        .filter(|r| matches!(r, Record::Write(_)))
        .count();
    println!("{writes} commits, {compaction_count} compactions\n");
    println!(
        "family    | written MB | compactions | merges | files merged | rewritten MB | -> MB    | \
         write amp | avg overlap after | final overlap | final files | final MB"
    );
    for (&family, t) in &totals {
        let ssts = state.family(family);
        let n = t.overlap_after_count.max(1) as f64;
        println!(
            "{:<9} | {:>10.1} | {:>11} | {:>6} | {:>12} | {:>12.1} | {:>8.1} | {:>9.2} | {:>17} | \
             {:>13} | {:>11} | {:>8.1}",
            family_name(family),
            mb(t.written),
            t.compactions,
            t.merges,
            t.merged_files,
            mb(t.rewritten),
            mb(t.output),
            t.rewritten as f64 / t.written.max(1) as f64,
            fmt_overlap((t.overlap_after_sum / n) as f32),
            fmt_overlap(overlap(&ssts)),
            ssts.len(),
            mb(ssts.iter().map(|s| s.size).sum()),
        );
    }
    println!(
        "\nEstimate check, over compactions that merged the family: actual overlap after vs the \
         estimate for the same merges"
    );
    for (&family, t) in &totals {
        if t.compacted_count == 0 {
            continue;
        }
        let n = t.compacted_count as f64;
        println!(
            "{:<9} | actual {} | estimated {}",
            family_name(family),
            fmt_overlap((t.overlap_after_family_sum / n) as f32),
            fmt_overlap((t.estimated_after_sum / n) as f32),
        );
    }
    if replay_enabled {
        println!(
            "\nReplay (space amplification {}, max files above bottom {}, rewrite factor {}, {} \
             merge jobs per compaction):",
            config.max_space_amplification,
            config.max_files_above_bottom,
            config.max_rewrite_factor,
            config.max_merge_segment_count
        );
        println!(
            "family    | compactions | merges | rewritten MB | vs actual | avg estimated overlap \
             after"
        );
        for (&family, t) in &totals {
            println!(
                "{:<9} | {:>11} | {:>6} | {:>12.1} | {:>9} | {:>27}",
                family_name(family),
                t.replay_compactions,
                t.replay_merges,
                mb(t.replay_rewritten),
                if t.rewritten > 0 {
                    format!("{:.2}x", t.replay_rewritten as f64 / t.rewritten as f64)
                } else {
                    "-".to_string()
                },
                {
                    let n = t.replay_overlap_after_count.max(1) as f64;
                    fmt_overlap((t.replay_overlap_after_sum / n) as f32)
                }
            );
        }
    }
    Ok(())
}
