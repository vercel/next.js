// copied from https://github.com/BurntSushi/critcmp/blob/master/src/data.rs

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct BaseBenchmarks {
    pub name: String,
    pub benchmarks: BTreeMap<String, Benchmark>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Benchmark {
    pub baseline: String,
    pub fullname: String,
    #[serde(rename = "criterion_benchmark_v1")]
    pub info: CBenchmark,
    #[serde(rename = "criterion_estimates_v1")]
    pub estimates: CEstimates,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CBenchmark {
    pub group_id: String,
    pub function_id: Option<String>,
    pub value_str: Option<String>,
    pub throughput: Option<CThroughput>,
    pub full_id: String,
    pub directory_name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct CThroughput {
    pub bytes: Option<u64>,
    pub elements: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CEstimates {
    pub mean: CStats,
    pub median: CStats,
    pub median_abs_dev: CStats,
    pub slope: Option<CStats>,
    pub std_dev: CStats,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CStats {
    pub confidence_interval: CConfidenceInterval,
    pub point_estimate: f64,
    pub standard_error: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CConfidenceInterval {
    pub confidence_level: f64,
    pub lower_bound: f64,
    pub upper_bound: f64,
}
