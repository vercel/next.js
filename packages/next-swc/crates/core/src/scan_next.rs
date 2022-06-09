//! Scanner for `next/image` and `next/script`.

use easy_error::{Error, ResultExt};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};
use swc_common::SourceMap;
use swc_ecmascript::{
    ast::EsVersion,
    parser::{parse_file_as_program, EsConfig, Syntax, TsConfig},
    visit::{Visit, VisitWith},
};

use serde::Serialize;

pub fn scan_next_imports(entry: &Path) -> Result<ScanResult, Error> {
    let worker = Worker {
        cm: Default::default(),
    };
    worker.scan_path(entry)
}

struct Worker {
    cm: Arc<SourceMap>,
}
impl Worker {
    fn scan_path(&self, entry: &Path) -> Result<ScanResult, Error> {
        let metadata = fs::metadata(&entry)
            .with_context(|| format!("failed to get metadata of '{}'", entry.display()))?;

        if metadata.is_dir() {
        } else if metadata.is_file() {
            if let Some(ext) = entry.extension() {
                if ext == "js" || ext == "jsx" || ext == "ts" || ext == "tsx" {
                    let fm = self
                        .cm
                        .load_file(entry)
                        .with_context(|| format!("failed to load file '{}'", entry.display()))?;

                    let program = parse_file_as_program(
                        &fm,
                        if ext == "js" || ext == "jsx" {
                            Syntax::Es(EsConfig {
                                jsx: ext == "jsx",
                                ..Default::default()
                            })
                        } else {
                            Syntax::Typescript(TsConfig {
                                tsx: ext == "tsx",
                                ..Default::default()
                            })
                        },
                        EsVersion::latest(),
                        None,
                        &mut vec![],
                    );
                    // Ignore parsing errors

                    if let Ok(p) = program {
                        let mut data = FileScanResult {
                            file: entry.to_path_buf(),
                            images: Default::default(),
                            scripts: Default::default(),
                        };
                        let mut v = Scanner { data: &mut data };
                        p.visit_with(&mut v);

                        if !v.data.images.is_empty() || !v.data.scripts.is_empty() {
                            return Ok(ScanResult { files: vec![data] });
                        }
                    }
                }
            }
        }

        Ok(Default::default())
    }
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub files: Vec<FileScanResult>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileScanResult {
    pub file: PathBuf,

    pub images: Vec<LineCol>,
    pub scripts: Vec<LineCol>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LineCol {
    pub line: usize,
    pub col: usize,
}

#[derive(Debug)]
struct Scanner<'a> {
    data: &'a mut FileScanResult,
}

impl Visit for Scanner<'_> {}
