pub(crate) mod data;

use std::{
    collections::{BTreeMap, hash_map::Entry},
    fs::File,
    hash::BuildHasherDefault,
    path::{Path, PathBuf},
    time::{Duration, UNIX_EPOCH},
};

use anyhow::{Context, anyhow};
use chrono::{DateTime, Utc};
use indexmap::IndexSet;
use rustc_hash::{FxHashMap, FxHasher};
use walkdir::WalkDir;

use self::data::Benchmark;
use crate::summarize_bench::data::{BaseBenchmarks, CStats};

type FxIndexSet<T> = IndexSet<T, BuildHasherDefault<FxHasher>>;

#[derive(Debug)]
struct BenchDataFile {
    path: PathBuf,
    sha: String,
    timestamp: u64,
    system: String,
}

impl<'a> TryFrom<&'a Path> for BenchDataFile {
    type Error = &'static str;

    fn try_from(path: &'a Path) -> Result<Self, Self::Error> {
        let key_dir = path.parent().ok_or("invalid structure")?;
        let sha_dir = key_dir.parent().ok_or("invalid structure")?;
        let system_dir = sha_dir.parent().ok_or("invalid structure")?;
        let (timestamp, sha) = sha_dir
            .file_name()
            .ok_or("invalid filename")?
            .to_str()
            .ok_or("invalid chars in file name")?
            .split_once('-')
            .ok_or("missing dash in timestamp-sha directory")?;
        Ok(Self {
            path: path.to_path_buf(),
            sha: sha.to_string(),
            timestamp: timestamp.parse().map_err(|_| "unable to parse timestamp")?,
            system: system_dir
                .file_name()
                .ok_or("invalid filename")?
                .to_str()
                .ok_or("invalid chars in file name")?
                .to_string(),
        })
    }
}

pub fn process_all(path: PathBuf) {
    let mut map = FxHashMap::default();
    for entry in WalkDir::new(&path)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| {
            e.file_type().is_file()
                && e.file_name().to_str().map(|n| n.ends_with("raw.json")) == Some(true)
        })
    {
        let data_file_result: Result<BenchDataFile, _> = entry.path().try_into();
        if let Ok(data_file) = data_file_result {
            let inner_map: &mut FxHashMap<_, _> = map.entry(data_file.system.clone()).or_default();
            let items: &mut Vec<BenchDataFile> =
                inner_map.entry(data_file.sha.clone()).or_default();
            items.push(data_file);
        }
    }
    for (system, inner_map) in map {
        let mut latest: FxHashMap<String, (u64, String, Benchmark)> = FxHashMap::default();
        for (sha, data_files) in inner_map {
            let min_ts = data_files.iter().map(|d| d.timestamp).min().unwrap();
            let max_ts = data_files.iter().map(|d| d.timestamp).max().unwrap();
            let mut items = data_files
                .iter()
                .map(|data_file| {
                    let file = File::open(&data_file.path).unwrap();
                    let reader = std::io::BufReader::new(file);
                    let data: BaseBenchmarks = serde_json::from_reader(reader)
                        .with_context(|| anyhow!("unable to read {}", data_file.path.display()))
                        .unwrap();
                    data
                })
                .collect::<Vec<_>>();
            let mut by_name = FxHashMap::default();
            for (i, data) in items.iter().enumerate() {
                for (name, bench) in data.benchmarks.iter() {
                    let list: &mut Vec<_> = by_name.entry(name).or_default();
                    list.push((i, bench));
                }
            }
            let mut normalization_state = items.iter().map(|_| (0.0, 0)).collect::<Vec<_>>();
            for list in by_name.values().filter(|l| l.len() > 1) {
                let avg = list
                    .iter()
                    .map(|(_, b)| b.estimates.mean.point_estimate)
                    .sum::<f64>()
                    / list.len() as f64;
                for (i, b) in list {
                    let correction = avg / b.estimates.mean.point_estimate;
                    let (sum, count) = &mut normalization_state[*i];
                    *sum += correction;
                    *count += 1;
                }
            }
            for (i, benches) in items.iter_mut().enumerate() {
                let (sum, count) = normalization_state[i];
                if count <= 1 {
                    continue;
                }
                let correction = sum / count as f64;
                for bench in benches.benchmarks.values_mut() {
                    fn correct(s: &mut CStats, f: f64) {
                        s.point_estimate *= f;
                        s.standard_error *= f;
                        s.confidence_interval.lower_bound *= f;
                        s.confidence_interval.upper_bound *= f;
                    }
                    correct(&mut bench.estimates.mean, correction);
                    correct(&mut bench.estimates.median, correction);
                    correct(&mut bench.estimates.median_abs_dev, correction);
                    if let Some(slope) = bench.estimates.slope.as_mut() {
                        correct(slope, correction);
                    }
                    correct(&mut bench.estimates.std_dev, correction);
                }
                // let data_file = &data_files[i];
                // benches.name = format!("{}-{sha}", data_file.timestamp);
                // let normalized =
                // data_file.path.parent().unwrap().join("normalized.json");
                // let file = File::create(&normalized).unwrap();
                // let writer = std::io::BufWriter::new(file);
                // serde_json::to_writer_pretty(writer, benches).unwrap();
            }
            let baseline = &sha[..7];
            let mut latest_for_sha = BaseBenchmarks {
                name: baseline.to_string(),
                benchmarks: BTreeMap::new(),
            };
            let all_benchmark_keys = items
                .iter()
                .flat_map(|b| b.benchmarks.keys())
                .collect::<FxIndexSet<_>>();
            for key in all_benchmark_keys {
                let (ts, bench) = items
                    .iter()
                    .enumerate()
                    .map(|(i, b)| (data_files[i].timestamp, b))
                    .filter_map(|(ts, benches)| benches.benchmarks.get(key).map(|b| (ts, b)))
                    .max_by_key(|(ts, _)| *ts)
                    .unwrap();
                let ts = UNIX_EPOCH + Duration::from_secs(ts);
                let ts = DateTime::<Utc>::from(ts);
                let ts = ts.format("%Y-%m-%d %H:%M");
                let key_ts = format!("{key} ({ts})");
                let key_ts_sha = format!("{key} ({ts}, {})", &sha[..7]);
                match latest.entry(key.to_string()) {
                    Entry::Occupied(mut e) => {
                        if e.get().0 < min_ts {
                            e.insert((min_ts, key_ts_sha, bench.clone()));
                        }
                    }
                    Entry::Vacant(e) => {
                        e.insert((min_ts, key_ts_sha, bench.clone()));
                    }
                }
                latest_for_sha.benchmarks.insert(key_ts, bench.clone());
            }
            let latest_for_sha_path = data_files
                .first()
                .unwrap()
                .path
                .parent()
                .unwrap()
                .parent()
                .unwrap()
                .parent()
                .unwrap()
                .join(format!("{min_ts}-{max_ts}-{sha}.json"));
            let file = File::create(&latest_for_sha_path).unwrap();
            let writer = std::io::BufWriter::new(file);
            serde_json::to_writer_pretty(writer, &latest_for_sha).unwrap();
            println!("{}", latest_for_sha_path.display());
        }

        let latest_for_system = BaseBenchmarks {
            name: "latest".to_string(),
            benchmarks: latest
                .into_values()
                .map(|(_, key, bench)| (key, bench))
                .collect(),
        };
        let latest_path = path.join(format!("{system}.json"));
        let file = File::create(&latest_path).unwrap();
        let writer = std::io::BufWriter::new(file);
        serde_json::to_writer_pretty(writer, &latest_for_system).unwrap();
        println!("{}", latest_path.display());
    }
}
