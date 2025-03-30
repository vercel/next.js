use std::{
    borrow::Cow,
    fmt::Write,
    path::{Path, MAIN_SEPARATOR},
};

use anyhow::Result;
use const_format::concatcp;
use once_cell::sync::Lazy;
use regex::Regex;
pub use trace::{trace_source_map, StackFrame, TraceResult};
use tracing::{instrument, Level};
use turbo_tasks::{ReadRef, Vc};
use turbo_tasks_fs::{
    source_context::get_source_context, to_sys_path, FileLinesContent, FileSystemPath,
};
use turbopack_cli_utils::source_context::format_source_context_lines;
use turbopack_core::{
    output::OutputAsset,
    source_map::{GenerateSourceMap, SourceMap},
    PROJECT_FILESYSTEM_NAME, SOURCE_URL_PROTOCOL,
};
use turbopack_ecmascript::magic_identifier::unmangle_identifiers;

use crate::{internal_assets_for_source_mapping, pool::FormattingMode, AssetsForSourceMapping};

pub mod trace;

const MAX_CODE_FRAMES: usize = 3;

pub async fn apply_source_mapping(
    text: &'_ str,
    assets_for_source_mapping: Vc<AssetsForSourceMapping>,
    root: Vc<FileSystemPath>,
    project_dir: Vc<FileSystemPath>,
    formatting_mode: FormattingMode,
) -> Result<Cow<'_, str>> {
    static STACK_TRACE_LINE: Lazy<Regex> =
        Lazy::new(|| Regex::new("\n    at (?:(.+) \\()?(.+):(\\d+):(\\d+)\\)?").unwrap());

    let mut it = STACK_TRACE_LINE.captures_iter(text).peekable();
    if it.peek().is_none() {
        return Ok(Cow::Borrowed(text));
    }
    let mut first_error = true;
    let mut visible_code_frames = 0;
    let mut new = String::with_capacity(text.len() * 2);
    let mut last_match = 0;
    for cap in it {
        // unwrap on 0 is OK because captures only reports matches
        let m = cap.get(0).unwrap();
        new.push_str(&text[last_match..m.start()]);
        let name = cap.get(1).map(|s| s.as_str());
        let file = cap.get(2).unwrap().as_str();
        let line = cap.get(3).unwrap().as_str();
        let column = cap.get(4).unwrap().as_str();
        let line = line.parse::<u32>()?;
        let column = column.parse::<u32>()?;
        let frame = StackFrame {
            name: name.map(|s| s.into()),
            file: file.into(),
            line: Some(line),
            column: Some(column),
        };
        let resolved =
            resolve_source_mapping(assets_for_source_mapping, root, project_dir.root(), &frame)
                .await;
        write_resolved(
            &mut new,
            resolved,
            &frame,
            &mut first_error,
            &mut visible_code_frames,
            formatting_mode,
        )?;
        last_match = m.end();
    }
    new.push_str(&text[last_match..]);
    Ok(Cow::Owned(new))
}

fn write_resolved(
    writable: &mut impl Write,
    resolved: Result<ResolvedSourceMapping>,
    original_frame: &StackFrame<'_>,
    first_error: &mut bool,
    visible_code_frames: &mut usize,
    formatting_mode: FormattingMode,
) -> Result<()> {
    const PADDING: &str = "\n    ";
    match resolved {
        Err(err) => {
            // There was an error resolving the source map
            write!(writable, "{PADDING}at {}", original_frame)?;
            if *first_error {
                write!(writable, "{PADDING}(error resolving source map: {})", err)?;
                *first_error = false;
            } else {
                write!(writable, "{PADDING}(error resolving source map)")?;
            }
        }
        Ok(ResolvedSourceMapping::NoSourceMap) | Ok(ResolvedSourceMapping::Unmapped) => {
            // There is no source map for this file or no mapping for the line
            write!(
                writable,
                "{PADDING}{}",
                formatting_mode.lowlight(&format_args!("[at {}]", original_frame))
            )?;
        }
        Ok(ResolvedSourceMapping::Mapped { frame }) => {
            // There is a mapping to something outside of the project (e. g. plugins,
            // internal code)
            write!(
                writable,
                "{PADDING}{}",
                formatting_mode.lowlight(&format_args!(
                    "at {} [{}]",
                    frame,
                    original_frame.with_name(None)
                ))
            )?;
        }
        Ok(ResolvedSourceMapping::MappedLibrary {
            frame,
            project_path,
        }) => {
            // There is a mapping to a file in the project directory, but to library code
            write!(
                writable,
                "{PADDING}{}",
                formatting_mode.lowlight(&format_args!(
                    "at {} [{}]",
                    frame.with_path(&project_path.path),
                    original_frame.with_name(None)
                ))
            )?;
        }
        Ok(ResolvedSourceMapping::MappedProject {
            frame,
            project_path,
            lines,
        }) => {
            // There is a mapping to a file in the project directory
            if let Some(name) = frame.name.as_ref() {
                write!(
                    writable,
                    "{PADDING}at {name} ({}) {}",
                    formatting_mode.highlight(&frame.with_name(None).with_path(&project_path.path)),
                    formatting_mode.lowlight(&format_args!("[{}]", original_frame.with_name(None)))
                )?;
            } else {
                write!(
                    writable,
                    "{PADDING}at {} {}",
                    formatting_mode.highlight(&frame.with_path(&project_path.path)),
                    formatting_mode.lowlight(&format_args!("[{}]", original_frame.with_name(None)))
                )?;
            }
            let (line, column) = frame.get_pos().unwrap_or((0, 0));
            let line = line.saturating_sub(1);
            let column = column.saturating_sub(1);
            if let FileLinesContent::Lines(lines) = &*lines {
                if *visible_code_frames < MAX_CODE_FRAMES {
                    let lines = lines.iter().map(|l| l.content.as_str());
                    let ctx = get_source_context(lines, line, column, line, column);
                    match formatting_mode {
                        FormattingMode::Plain => {
                            write!(writable, "\n{}", ctx)?;
                        }
                        FormattingMode::AnsiColors => {
                            writable.write_char('\n')?;
                            format_source_context_lines(&ctx, writable);
                        }
                    }
                    *visible_code_frames += 1;
                }
            }
        }
    }
    Ok(())
}

enum ResolvedSourceMapping {
    NoSourceMap,
    Unmapped,
    Mapped {
        frame: StackFrame<'static>,
    },
    MappedProject {
        frame: StackFrame<'static>,
        project_path: ReadRef<FileSystemPath>,
        lines: ReadRef<FileLinesContent>,
    },
    MappedLibrary {
        frame: StackFrame<'static>,
        project_path: ReadRef<FileSystemPath>,
    },
}

async fn resolve_source_mapping(
    assets_for_source_mapping: Vc<AssetsForSourceMapping>,
    root: Vc<FileSystemPath>,
    project_dir: Vc<FileSystemPath>,
    frame: &StackFrame<'_>,
) -> Result<ResolvedSourceMapping> {
    let Some((line, column)) = frame.get_pos() else {
        return Ok(ResolvedSourceMapping::NoSourceMap);
    };
    let name = frame.name.as_ref();
    let file = &frame.file;
    let Some(root) = to_sys_path(root).await? else {
        return Ok(ResolvedSourceMapping::NoSourceMap);
    };
    let Ok(file) = Path::new(file.as_ref()).strip_prefix(root) else {
        return Ok(ResolvedSourceMapping::NoSourceMap);
    };
    let file = file.to_string_lossy();
    let file = if MAIN_SEPARATOR != '/' {
        Cow::Owned(file.replace(MAIN_SEPARATOR, "/"))
    } else {
        file
    };
    let map = assets_for_source_mapping.await?;
    let Some(generate_source_map) = map.get(file.as_ref()) else {
        return Ok(ResolvedSourceMapping::NoSourceMap);
    };
    let sm = generate_source_map.generate_source_map();
    let Some(sm) = &*SourceMap::new_from_rope_cached(sm).await? else {
        return Ok(ResolvedSourceMapping::NoSourceMap);
    };
    let trace = trace_source_map(sm, line, column, name.map(|s| &**s)).await?;
    match trace {
        TraceResult::Found(frame) => {
            let lib_code = frame.file.contains("/node_modules/");
            if let Some(project_path) = frame.file.strip_prefix(concatcp!(
                SOURCE_URL_PROTOCOL,
                "///[",
                PROJECT_FILESYSTEM_NAME,
                "]/"
            )) {
                let fs_path = project_dir.join(project_path.into());
                if lib_code {
                    return Ok(ResolvedSourceMapping::MappedLibrary {
                        frame: frame.clone(),
                        project_path: fs_path.await?,
                    });
                } else {
                    let lines = fs_path.read().lines().await?;
                    return Ok(ResolvedSourceMapping::MappedProject {
                        frame: frame.clone(),
                        project_path: fs_path.await?,
                        lines,
                    });
                }
            }
            Ok(ResolvedSourceMapping::Mapped {
                frame: frame.clone(),
            })
        }
        TraceResult::NotFound => Ok(ResolvedSourceMapping::Unmapped),
    }
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub struct StructuredError {
    pub name: String,
    pub message: String,
    #[turbo_tasks(trace_ignore)]
    stack: Vec<StackFrame<'static>>,
    cause: Option<Box<StructuredError>>,
}

impl StructuredError {
    pub async fn print(
        &self,
        assets_for_source_mapping: Vc<AssetsForSourceMapping>,
        root: Vc<FileSystemPath>,
        root_path: Vc<FileSystemPath>,
        formatting_mode: FormattingMode,
    ) -> Result<String> {
        let mut message = String::new();

        let magic = |content| formatting_mode.magic_identifier(content);

        write!(
            message,
            "{}: {}",
            self.name,
            unmangle_identifiers(&self.message, magic)
        )?;

        let mut first_error = true;
        let mut visible_code_frames = 0;

        for frame in &self.stack {
            let frame = frame.unmangle_identifiers(magic);
            let resolved =
                resolve_source_mapping(assets_for_source_mapping, root, root_path, &frame).await;
            write_resolved(
                &mut message,
                resolved,
                &frame,
                &mut first_error,
                &mut visible_code_frames,
                formatting_mode,
            )?;
        }

        if let Some(cause) = &self.cause {
            message.write_str("\nCaused by: ")?;
            message.write_str(
                &Box::pin(cause.print(assets_for_source_mapping, root, root_path, formatting_mode))
                    .await?,
            )?;
        }

        Ok(message)
    }
}

pub async fn trace_stack(
    error: StructuredError,
    root_asset: Vc<Box<dyn OutputAsset>>,
    output_path: Vc<FileSystemPath>,
    project_dir: Vc<FileSystemPath>,
) -> Result<String> {
    let assets_for_source_mapping = internal_assets_for_source_mapping(root_asset, output_path);

    trace_stack_with_source_mapping_assets(
        error,
        assets_for_source_mapping,
        output_path,
        project_dir,
    )
    .await
}

#[instrument(level = Level::TRACE, skip_all)]
pub async fn trace_stack_with_source_mapping_assets(
    error: StructuredError,
    assets_for_source_mapping: Vc<AssetsForSourceMapping>,
    output_path: Vc<FileSystemPath>,
    project_dir: Vc<FileSystemPath>,
) -> Result<String> {
    error
        .print(
            assets_for_source_mapping,
            output_path,
            project_dir,
            FormattingMode::Plain,
        )
        .await
}
