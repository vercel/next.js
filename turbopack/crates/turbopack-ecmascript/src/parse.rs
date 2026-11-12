use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use async_trait::async_trait;
use bytes_str::BytesStr;
use rustc_hash::{FxHashMap, FxHashSet};
use swc_core::{
    atoms::Atom,
    base::SwcComments,
    common::{
        BytePos, FileName, GLOBALS, Globals, LineCol, Mark, Span, SyntaxContext,
        errors::{HANDLER, Handler},
        input::StringInput,
        source_map::{Files, SourceMapGenConfig, build_source_map},
    },
    ecma::{
        ast::{
            EsVersion, Id, Ident, IdentName, ObjectPatProp, Pat, Program, TsModuleDecl,
            TsModuleName, VarDecl,
        },
        lints::{self, config::LintConfig, rules::LintParams},
        parser::{EsSyntax, Parser, Syntax, TsSyntax, lexer::Lexer},
        transforms::{
            base::{
                helpers::{HELPERS, Helpers},
                resolver,
            },
            proposal::explicit_resource_management::explicit_resource_management,
        },
        visit::{Visit, VisitMutWith, VisitWith, noop_visit_type},
    },
};
use tracing::{Instrument, instrument};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{PrettyPrintError, ResolvedVc, ValueToString, Vc, turbofmt, util::WrapFuture};
use turbo_tasks_fs::{FileContent, FileSystemPath, rope::Rope};
use turbo_tasks_hash::hash_xxh3_hash64;
use turbopack_core::{
    SOURCE_URL_PROTOCOL_STR,
    asset::{Asset, AssetContent},
    issue::{Issue, IssueExt, IssueSeverity, IssueSource, IssueStage, StyledString},
    source::Source,
    source_map::{structured::StructuredSourceMap, utils::add_default_ignore_list},
};
use turbopack_swc_utils::emitter::IssueEmitter;

use super::EcmascriptModuleAssetType;
use crate::{
    EcmascriptInputTransform,
    analyzer::graph::EvalContext,
    magic_identifier,
    swc_comments::ImmutableComments,
    transform::{BrowserJsxImport, EcmascriptInputTransforms, TransformContext},
};

/// Exclude only comments which the actual emitter did not consume. Their
/// trailing lexical whitespace also disappeared; keep the next token's anchor.
fn removed_comment_ranges(files: &impl Files, comments: &[Span]) -> Vec<((u32, u32), (u32, u32))> {
    let mut ranges = Vec::new();
    for comment in comments {
        let lo = files.map_raw_pos(comment.lo);
        let mut hi = files.map_raw_pos(comment.hi);
        if lo >= hi || lo.is_dummy() || hi.is_dummy() {
            continue;
        }
        let Ok(Some(file)) = files.try_lookup_source_file(comment.lo) else {
            continue;
        };
        if lo < file.start_pos || hi > file.end_pos {
            continue;
        }
        let Some(suffix) = file.src.get((hi.0 - file.start_pos.0) as usize..) else {
            continue;
        };
        hi.0 += suffix
            .chars()
            .take_while(|character| character.is_whitespace() || *character == '\u{feff}')
            .map(|character| character.len_utf8() as u32)
            .sum::<u32>();
        let position = |pos: BytePos| {
            let line = file.lookup_line(pos)?;
            let line_start = file.analyze().lines[line];
            let text = file.src.get(
                (line_start.0 - file.start_pos.0) as usize..(pos.0 - file.start_pos.0) as usize,
            )?;
            Some((line as u32, text.encode_utf16().count() as u32))
        };
        if let (Some(start), Some(end)) = (position(lo), position(hi)) {
            ranges.push((start, end));
        }
    }
    ranges.sort_unstable();
    ranges.dedup();
    ranges
}

fn remove_collapsed_comment_mappings(
    original: &[u8],
    ranges: &[((u32, u32), (u32, u32))],
) -> Result<Vec<u8>> {
    use std::collections::BTreeMap;

    use serde_json::value::RawValue;
    use swc_sourcemap::vlq::{generate_vlq_segment, parse_vlq_segment};

    // Keep the existing parser authoritative, including its optional/opaque
    // fields and anti-XSSI prefix support. Never materialize source/name data.
    swc_sourcemap::lazy::decode(original)?.into_source_map()?;
    let mut sorted_ranges = ranges.to_vec();
    sorted_ranges.sort_unstable();
    let mut ranges = Vec::<((u32, u32), (u32, u32))>::new();
    for (start, end) in sorted_ranges {
        if let Some(previous) = ranges.last_mut().filter(|previous| start <= previous.1) {
            previous.1 = previous.1.max(end);
        } else {
            ranges.push((start, end));
        }
    }
    const BASE64: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    fn replace_values(original: &[u8], mut edits: Vec<(usize, usize, Vec<u8>)>) -> Vec<u8> {
        edits.sort_unstable_by_key(|edit| edit.0);
        let mut result = Vec::new();
        let mut previous = 0;
        for (start, end, value) in edits {
            result.extend_from_slice(&original[previous..start]);
            result.extend_from_slice(&value);
            previous = end;
        }
        result.extend_from_slice(&original[previous..]);
        result
    }

    fn edit(
        original: &[u8],
        value: &RawValue,
        replacement: Vec<u8>,
    ) -> Result<(usize, usize, Vec<u8>)> {
        let start = (value.get().as_ptr() as usize)
            .checked_sub(original.as_ptr() as usize)
            .context("Source map value escaped its original bytes")?;
        let end = start
            .checked_add(value.get().len())
            .context("Source map value overflow")?;
        anyhow::ensure!(
            end <= original.len(),
            "Source map value escaped its original bytes"
        );
        Ok((start, end, replacement))
    }

    fn rewrite(
        original: &[u8],
        ranges: &[((u32, u32), (u32, u32))],
        offset: (u32, u32),
    ) -> Result<Vec<u8>> {
        // The dependency has already validated any junk prefix. Its parser
        // begins JSON at the header's first newline, which we leave untouched.
        let json = if original
            .first()
            .is_some_and(|byte| matches!(byte, b')' | b']' | b'}' | b'\''))
        {
            &original[original
                .iter()
                .position(|byte| *byte == b'\n')
                .context("Missing source map header newline")?..]
        } else {
            original
        };
        let fields: BTreeMap<String, &RawValue> = serde_json::from_slice(json)?;
        let sections = fields
            .get("sections")
            .map(|value| {
                serde_json::from_str::<Option<Vec<BTreeMap<String, &RawValue>>>>(value.get())
            })
            .transpose()?
            .flatten();
        if let Some(sections) = sections {
            let mut edits = Vec::new();
            for section in sections {
                let position: serde_json::Value = serde_json::from_str(section["offset"].get())?;
                let line = u32::try_from(
                    position["line"]
                        .as_u64()
                        .context("Invalid source map section line")?,
                )?;
                let column = u32::try_from(
                    position["column"]
                        .as_u64()
                        .context("Invalid source map section column")?,
                )?;
                let offset = (
                    offset
                        .0
                        .checked_add(line)
                        .context("Source map section line overflow")?,
                    column
                        .checked_add(if line == 0 { offset.1 } else { 0 })
                        .context("Source map section column overflow")?,
                );
                let value = section
                    .get("map")
                    .context("Missing inline source map section")?;
                let rewritten = rewrite(value.get().as_bytes(), ranges, offset)?;
                if rewritten != value.get().as_bytes() {
                    edits.push(edit(original, value, rewritten)?);
                }
            }
            return Ok(replace_values(original, edits));
        }
        let mappings = fields
            .get("mappings")
            .map(|value| serde_json::from_str::<Option<String>>(value.get()))
            .transpose()?
            .flatten()
            .unwrap_or_default();
        let flags = fields
            .get("rangeMappings")
            .map(|value| serde_json::from_str::<Option<String>>(value.get()))
            .transpose()?
            .flatten()
            .unwrap_or_default();
        let mut flag_rows = flags.split(';');
        let mut input = [0u32; 4];
        let mut output = [0u32; 4];
        let mut mapping_rows = Vec::new();
        let mut output_flags = Vec::new();
        let mut removed = false;
        for (line, row) in mappings.split(';').enumerate() {
            let flag_row = flag_rows.next().unwrap_or_default().as_bytes();
            let mut column = 0u32;
            let mut previous_column = 0u32;
            let mut segments = Vec::new();
            let mut row_flags = Vec::<u8>::new();
            for (index, segment) in row.split(',').enumerate() {
                if segment.is_empty() {
                    continue;
                }
                let mut values = parse_vlq_segment(segment)?;
                column = (i64::from(column) + values[0]) as u32;
                if values.len() > 1 {
                    for field in 0..3 {
                        input[field] = (i64::from(input[field]) + values[field + 1]) as u32;
                    }
                    if values.len() == 5 {
                        input[3] = (i64::from(input[3]) + values[4]) as u32;
                    }
                }
                let position = (
                    (line as u32)
                        .checked_add(offset.0)
                        .context("Source map line overflow")?,
                    column
                        .checked_add(if line == 0 { offset.1 } else { 0 })
                        .context("Source map column overflow")?,
                );
                let range = ranges.partition_point(|(start, _)| *start <= position);
                if range > 0 && position < ranges[range - 1].1 {
                    removed = true;
                    continue;
                }
                values[0] = i64::from(column) - i64::from(previous_column);
                previous_column = column;
                if values.len() > 1 {
                    for field in 0..3 {
                        values[field + 1] = i64::from(input[field]) - i64::from(output[field]);
                        output[field] = input[field];
                    }
                    if values.len() == 5 {
                        values[4] = i64::from(input[3]) - i64::from(output[3]);
                        output[3] = input[3];
                    }
                }
                let bits = flag_row
                    .get(index / 6)
                    .map(|byte| {
                        BASE64
                            .iter()
                            .position(|value| value == byte)
                            .context("Invalid range mapping character")
                    })
                    .transpose()?
                    .unwrap_or_default();
                if bits & (1 << (index % 6)) != 0 {
                    let index = segments.len();
                    row_flags.resize(index / 6 + 1, 0);
                    row_flags[index / 6] |= 1 << (index % 6);
                }
                segments.push(generate_vlq_segment(&values)?);
            }
            mapping_rows.push(segments.join(","));
            output_flags.push(
                row_flags
                    .iter()
                    .map(|bits| BASE64[*bits as usize] as char)
                    .collect::<String>(),
            );
        }
        if !removed {
            return Ok(original.to_vec());
        }
        let mut edits = vec![edit(
            original,
            fields["mappings"],
            serde_json::to_vec(&mapping_rows.join(";"))?,
        )?];
        if let Some(value) = fields.get("rangeMappings") {
            if value.get() != "null" {
                edits.push(edit(
                    original,
                    value,
                    serde_json::to_vec(&output_flags.join(";"))?,
                )?);
            }
        }
        Ok(replace_values(original, edits))
    }

    rewrite(original, &ranges, (0, 0))
}

/// Collects identifier names and their byte positions from an AST.
/// This is used to populate the `names` field in source maps.
/// Based on swc_compiler_base::IdentCollector.
pub struct IdentCollector {
    names_vec: Vec<(BytePos, Atom)>,
    /// Stack of current class names for mapping constructors to class names
    class_stack: Vec<Atom>,
}

impl IdentCollector {
    /// Converts the collected identifiers into a map keyed by the start position of the identifier
    pub fn into_map(self) -> FxHashMap<BytePos, Atom> {
        FxHashMap::from_iter(self.names_vec)
    }
}
impl Default for IdentCollector {
    fn default() -> Self {
        Self {
            names_vec: Vec::with_capacity(128),
            class_stack: Vec::new(),
        }
    }
}

/// Unmangles a Turbopack magic identifier, returning the original name or the input if not mangled
fn unmangle_atom(name: &Atom) -> Atom {
    magic_identifier::unmangle(name)
        .map(Atom::from)
        .unwrap_or_else(|| name.clone())
}

impl Visit for IdentCollector {
    noop_visit_type!();

    fn visit_ident(&mut self, ident: &Ident) {
        // Skip dummy spans - these are synthetic/generated identifiers
        if !ident.span.lo.is_dummy() {
            // we can get away with just the `lo` positions since identifiers cannot overlap.
            self.names_vec
                .push((ident.span.lo, unmangle_atom(&ident.sym)));
        }
    }

    fn visit_ident_name(&mut self, ident: &IdentName) {
        if ident.span.lo.is_dummy() {
            return;
        }

        // Map constructor names to the class name
        let mut sym = &ident.sym;
        if ident.sym == "constructor" {
            if let Some(class_name) = self.class_stack.last() {
                sym = class_name;
            } else {
                // If no class name in stack, skip the constructor mapping
                return;
            }
        }

        self.names_vec.push((ident.span.lo, unmangle_atom(sym)));
    }

    fn visit_class_decl(&mut self, decl: &swc_core::ecma::ast::ClassDecl) {
        // Push class name onto stack
        self.class_stack.push(decl.ident.sym.clone());

        // Visit the identifier and class
        self.visit_ident(&decl.ident);
        self.visit_class(&decl.class);

        // Pop class name from stack
        self.class_stack.pop();
    }

    fn visit_class_expr(&mut self, expr: &swc_core::ecma::ast::ClassExpr) {
        // Push class name onto stack if it exists
        if let Some(ref ident) = expr.ident {
            self.class_stack.push(ident.sym.clone());
            self.visit_ident(ident);
        }

        // Visit the class body
        self.visit_class(&expr.class);

        // Pop class name from stack if it was pushed
        if expr.ident.is_some() {
            self.class_stack.pop();
        }
    }
}

#[turbo_tasks::value(shared, serialization = "skip", eq = "manual", cell = "new")]
#[allow(clippy::large_enum_variant)]
pub enum ParseResult {
    Ok {
        #[turbo_tasks(debug_ignore, unsafe_ignore)]
        program: Program,
        #[turbo_tasks(debug_ignore, unsafe_ignore)]
        comments: Arc<ImmutableComments>,
        #[turbo_tasks(debug_ignore, unsafe_ignore)]
        eval_context: EvalContext,
        #[turbo_tasks(debug_ignore, unsafe_ignore)]
        globals: Arc<Globals>,
        #[turbo_tasks(debug_ignore, unsafe_ignore)]
        source_map: Arc<swc_core::common::SourceMap>,
        source_mapping_url: Option<RcStr>,
        /// Raw bytes of the source that produced this parse, captured atomically
        /// with the AST. `failsafe_parse` uses this to recover good parses in development on
        /// error.
        #[turbo_tasks(debug_ignore)]
        program_source: Rope,
        /// Actual imports introduced by the opted-in React transform of this parse.
        #[turbo_tasks(debug_ignore, unsafe_ignore)]
        browser_jsx_imports: Vec<BrowserJsxImport>,
    },
    Unparsable {
        messages: Option<Vec<RcStr>>,
    },
    NotFound,
}

/// Generates a [`StructuredSourceMap`] for the transformed code, whose `sourcesContent`
/// entries are individual shared ropes instead of being embedded in the serialized JSON. This
/// keeps later `sources` URL rewrites and map embedding from copying the source text of every
/// module. Serialize with [`StructuredSourceMap::to_rope`] where raw bytes are needed.
///
/// `original_source_maps_complete` indicates whether the `original_source_maps` cover the whole
/// map, i.e. whether every module that ended up in `mappings` had an original sourcemap.
#[instrument(level = "info", name = "generate source map", skip_all)]
pub fn generate_js_source_map<'a>(
    files_map: &impl Files,
    mappings: Vec<(BytePos, LineCol)>,
    original_source_maps: impl IntoIterator<Item = &'a Rope>,
    original_source_maps_complete: bool,
    inline_sources_content: bool,
    names: FxHashMap<BytePos, Atom>,
    removed_comments: &[Span],
) -> Result<StructuredSourceMap> {
    let original_source_maps = original_source_maps
        .into_iter()
        .map(|map| map.to_bytes())
        .collect::<Vec<_>>();
    let fast_path_single_original_source_map =
        original_source_maps.len() == 1 && original_source_maps_complete;
    let collapsed_comments = if fast_path_single_original_source_map {
        removed_comment_ranges(files_map, removed_comments)
    } else {
        Vec::new()
    };
    let rewritten_original = if collapsed_comments.is_empty() {
        None
    } else {
        Some(remove_collapsed_comment_mappings(
            &original_source_maps[0],
            &collapsed_comments,
        )?)
    };
    let original_source_maps = original_source_maps
        .iter()
        .enumerate()
        .map(|(index, map)| {
            let bytes: &[u8] = match (index, &rewritten_original) {
                (0, Some(rewritten)) => rewritten,
                _ => map,
            };
            Ok(swc_sourcemap::lazy::decode(bytes)?.into_source_map()?)
        })
        .collect::<Result<Vec<_>>>()?;

    // PLACEHOLDER is outside authorable source positions. Native operations use
    // it to end a preceding comment/user mapping at their actual emitted start.
    let unmapped = mappings
        .iter()
        .filter_map(|(position, generated)| {
            (files_map.map_raw_pos(*position) == BytePos::PLACEHOLDER).then_some(*generated)
        })
        .collect::<Vec<_>>();

    let mut new_mappings = build_source_map(
        files_map,
        &mappings,
        None,
        &InlineSourcesContentConfig {
            // If we are going to adjust the source map, we are going to throw the source contents
            // of this source map away regardless.
            //
            // In other words, we don't need the content of `B` in source map chain of A -> B -> C.
            // We only need the source content of `A`, and a way to map the content of `B` back to
            // `A`, while constructing the final source map, `C`.
            inline_sources_content: inline_sources_content && !fast_path_single_original_source_map,
            names,
        },
    );

    let map = if original_source_maps.is_empty() {
        // We don't convert sourcemap::SourceMap into raw_sourcemap::SourceMap because we don't
        // need to adjust mappings
        add_default_ignore_list(&mut new_mappings);
        StructuredSourceMap::from_swc_map(new_mappings)
    } else if fast_path_single_original_source_map {
        let mut map = original_source_maps.into_iter().next().unwrap();
        // TODO: Make this more efficient
        map.adjust_mappings(new_mappings);

        // TODO: Enable this when we have a way to handle the ignore list
        // add_default_ignore_list(&mut map);
        let map = map.into_raw_sourcemap();
        // The fallback covers raw maps with fields the structured form does not know.
        StructuredSourceMap::from_serialize(&map)
            .or_else(|_| StructuredSourceMap::from_json_slice(&serde_json::to_vec(&map)?))
    } else {
        let mut map = new_mappings.adjust_mappings_from_multiple(original_source_maps);

        add_default_ignore_list(&mut map);

        StructuredSourceMap::from_swc_map(map)
    }?;
    map.with_unmapped_segments(
        &unmapped
            .into_iter()
            .map(|position| (position.line, position.col))
            .collect::<Vec<_>>(),
    )
}

/// A config to generate a source map which includes the source content of every
/// source file. SWC doesn't inline sources content by default when generating a
/// sourcemap, so we need to provide a custom config to do it.
pub struct InlineSourcesContentConfig {
    inline_sources_content: bool,
    names: FxHashMap<BytePos, Atom>,
}

impl SourceMapGenConfig for InlineSourcesContentConfig {
    fn file_name_to_source(&self, f: &FileName) -> String {
        match f {
            FileName::Custom(s) => {
                // format! here is suboptimal and allocates over and over again.
                // On a random test next test project this one spot accounted for
                // 10% of allocations, hence the more verbose approach.
                let mut out = String::with_capacity(SOURCE_URL_PROTOCOL_STR.len() + 3 + s.len());
                out.push_str(SOURCE_URL_PROTOCOL_STR);
                out.push_str("///");
                out.push_str(s);
                out
            }
            _ => f.to_string(),
        }
    }

    fn inline_sources_content(&self, _f: &FileName) -> bool {
        self.inline_sources_content
    }

    fn name_for_bytepos(&self, pos: BytePos) -> Option<&str> {
        self.names.get(&pos).map(|v| &**v)
    }
}

#[turbo_tasks::function]
pub async fn parse(
    source: ResolvedVc<Box<dyn Source>>,
    ty: EcmascriptModuleAssetType,
    transforms: ResolvedVc<EcmascriptInputTransforms>,
    node_env: RcStr,
    loose_errors: bool,
    inline_helpers: bool,
) -> Result<Vc<ParseResult>> {
    Ok(parse_with_module_grammar(
        *source,
        ty,
        *transforms,
        node_env,
        loose_errors,
        inline_helpers,
        false,
    ))
}

#[turbo_tasks::function]
pub async fn parse_with_module_grammar(
    source: ResolvedVc<Box<dyn Source>>,
    ty: EcmascriptModuleAssetType,
    transforms: ResolvedVc<EcmascriptInputTransforms>,
    node_env: RcStr,
    loose_errors: bool,
    inline_helpers: bool,
    parse_as_module: bool,
) -> Result<Vc<ParseResult>> {
    let span = tracing::info_span!(
        "parse ecmascript",
        name = display(source.ident().to_string().await?),
        ty = display(&ty)
    );

    match parse_internal(
        source,
        ty,
        transforms,
        node_env,
        loose_errors,
        inline_helpers,
        parse_as_module,
    )
    .instrument(span)
    .await
    {
        Ok(result) => Ok(result),
        // ast-grep-ignore: no-context-turbofmt
        Err(error) => Err(error.context(turbofmt!("failed to parse {}", source.ident()).await?)),
    }
}

async fn parse_internal(
    source: ResolvedVc<Box<dyn Source>>,
    ty: EcmascriptModuleAssetType,
    transforms: ResolvedVc<EcmascriptInputTransforms>,
    node_env: RcStr,
    loose_errors: bool,
    inline_helpers: bool,
    parse_as_module: bool,
) -> Result<Vc<ParseResult>> {
    let content = source.content();
    let source_ident = source.ident().await?;
    let fs_path = &source_ident.path;
    let ident = &*source.ident().to_string().await?;
    let file_path_hash = hash_xxh3_hash64(ident) as u128;
    let content = match content.await {
        Ok(content) => content,
        Err(error) => {
            let error: RcStr = PrettyPrintError(&error).to_string().into();
            ReadSourceIssue {
                source: IssueSource::from_source_only(source),
                error: error.clone(),
                severity: if loose_errors {
                    IssueSeverity::Warning
                } else {
                    IssueSeverity::Error
                },
            }
            .resolved_cell()
            .emit();

            return Ok(ParseResult::Unparsable {
                messages: Some(vec![error]),
            }
            .cell());
        }
    };
    Ok(match &*content {
        AssetContent::File(file) => match &*file.await? {
            FileContent::NotFound => ParseResult::NotFound.cell(),
            FileContent::Content(file) => {
                let transforms = &*transforms.await?;
                match parse_file_content(
                    file.content().clone(),
                    fs_path,
                    ident,
                    source_ident.query.clone(),
                    file_path_hash,
                    source,
                    ty,
                    transforms,
                    node_env.clone(),
                    loose_errors,
                    inline_helpers,
                    parse_as_module,
                )
                .await
                {
                    Ok(result) => result,
                    Err(e) => {
                        // ast-grep-ignore: no-context-turbofmt
                        return Err(e).context(
                            turbofmt!("Transforming and/or parsing of {} failed", source.ident())
                                .await?,
                        );
                    }
                }
            }
        },
        AssetContent::Redirect(..) => ParseResult::Unparsable { messages: None }.cell(),
    })
}

fn parse_program(
    parser: &mut Parser<Lexer<'_>>,
    parse_as_module: bool,
) -> Result<Program, swc_core::ecma::parser::error::Error> {
    if parse_as_module {
        parser.parse_module().map(Program::Module)
    } else {
        parser.parse_program()
    }
}

async fn parse_file_content(
    program_source: Rope,
    fs_path: &FileSystemPath,
    ident: &str,
    query: RcStr,
    file_path_hash: u128,
    source: ResolvedVc<Box<dyn Source>>,
    ty: EcmascriptModuleAssetType,
    transforms: &[EcmascriptInputTransform],
    node_env: RcStr,
    loose_errors: bool,
    inline_helpers: bool,
    parse_as_module: bool,
) -> Result<Vc<ParseResult>> {
    let string = match BytesStr::from_utf8(program_source.clone().into_bytes()) {
        Ok(s) => s,
        Err(error) => {
            let error: RcStr = PrettyPrintError(
                &anyhow::anyhow!(error).context("failed to convert rope into string"),
            )
            .to_string()
            .into();
            ReadSourceIssue {
                // Technically we could supply byte offsets to the issue source, but
                // that would cause another utf8 error to be produced when we
                // attempt to infer line/column
                // offsets
                source: IssueSource::from_source_only(source),
                error: error.clone(),
                severity: if loose_errors {
                    IssueSeverity::Warning
                } else {
                    IssueSeverity::Error
                },
            }
            .resolved_cell()
            .emit();
            return Ok(ParseResult::Unparsable {
                messages: Some(vec![error]),
            }
            .cell());
        }
    };
    let source_map: Arc<swc_core::common::SourceMap> = Default::default();
    let (emitter, collector) = IssueEmitter::new(
        source,
        source_map.clone(),
        Some(rcstr!("Ecmascript file had an error")),
    );
    let handler = Handler::with_emitter(true, false, Box::new(emitter));

    let (emitter, collector_parse) = IssueEmitter::new(
        source,
        source_map.clone(),
        Some(rcstr!("Parsing ecmascript source code failed")),
    );
    let parser_handler = Handler::with_emitter(true, false, Box::new(emitter));
    let globals = Arc::new(Globals::new());
    let globals_ref = &globals;

    let mut result = WrapFuture::new(
        async {
            let file_name = FileName::Custom(ident.to_string());
            let fm = source_map.new_source_file(file_name.clone().into(), string);

            let comments = SwcComments::default();

            let mut parsed_program = {
                let lexer = Lexer::new(
                    match ty {
                        EcmascriptModuleAssetType::Ecmascript
                        | EcmascriptModuleAssetType::EcmascriptExtensionless => {
                            Syntax::Es(EsSyntax {
                                jsx: true,
                                fn_bind: true,
                                decorators: true,
                                decorators_before_export: true,
                                export_default_from: true,
                                import_attributes: true,
                                allow_super_outside_method: true,
                                allow_return_outside_function: true,
                                auto_accessors: true,
                                explicit_resource_management: true,
                            })
                        }
                        EcmascriptModuleAssetType::Typescript { tsx, .. } => {
                            Syntax::Typescript(TsSyntax {
                                decorators: true,
                                dts: false,
                                tsx,
                                ..Default::default()
                            })
                        }
                        EcmascriptModuleAssetType::TypescriptDeclaration => {
                            Syntax::Typescript(TsSyntax {
                                decorators: true,
                                dts: true,
                                tsx: false,
                                ..Default::default()
                            })
                        }
                    },
                    EsVersion::latest(),
                    StringInput::from(&*fm),
                    Some(&comments),
                );

                let mut parser = Parser::new_from(lexer);
                let span = tracing::trace_span!("swc_parse").entered();
                let program_result = parse_program(&mut parser, parse_as_module);
                drop(span);

                let mut has_errors = vec![];
                for e in parser.take_errors() {
                    let mut e = e.into_diagnostic(&parser_handler);
                    has_errors.extend(e.message.iter().map(|m| m.0.as_str().into()));
                    e.emit();
                }

                if !has_errors.is_empty() {
                    return Ok(ParseResult::Unparsable {
                        messages: Some(has_errors),
                    });
                }

                match program_result {
                    Ok(parsed_program) => parsed_program,
                    Err(e) => {
                        let mut e = e.into_diagnostic(&parser_handler);
                        let messages = e.message.iter().map(|m| m.0.as_str().into()).collect();

                        e.emit();

                        return Ok(ParseResult::Unparsable {
                            messages: Some(messages),
                        });
                    }
                }
            };

            let unresolved_mark = Mark::new();
            let top_level_mark = Mark::new();

            let is_typescript = matches!(
                ty,
                EcmascriptModuleAssetType::Typescript { .. }
                    | EcmascriptModuleAssetType::TypescriptDeclaration
            );

            let helpers = Helpers::new(!inline_helpers);
            let span = tracing::trace_span!("swc_resolver").entered();

            parsed_program.visit_mut_with(&mut resolver(
                unresolved_mark,
                top_level_mark,
                is_typescript,
            ));
            drop(span);

            let span = tracing::trace_span!("swc_lint").entered();

            let lint_config = LintConfig::default();
            let rules = lints::rules::all(LintParams {
                program: &parsed_program,
                lint_config: &lint_config,
                unresolved_ctxt: SyntaxContext::empty().apply_mark(unresolved_mark),
                top_level_ctxt: SyntaxContext::empty().apply_mark(top_level_mark),
                es_version: EsVersion::latest(),
                source_map: source_map.clone(),
            });

            parsed_program.mutate(lints::rules::lint_pass(rules));
            drop(span);

            HELPERS.set(&helpers, || {
                parsed_program.mutate(explicit_resource_management());
            });

            let var_with_ts_declare = if is_typescript {
                VarDeclWithTsDeclareCollector::collect(&parsed_program)
            } else {
                FxHashSet::default()
            };

            let mut helpers = helpers.data();
            let browser_jsx_imports = transforms
                .iter()
                .any(|transform| {
                    matches!(
                        transform,
                        EcmascriptInputTransform::React {
                            capture_browser_jsx_imports: true,
                            ..
                        }
                    )
                })
                .then(|| Mutex::new(Vec::new()));
            let transform_context = TransformContext {
                comments: &comments,
                source_map: &source_map,
                top_level_mark,
                unresolved_mark,
                file_path_str: &fs_path.path,
                file_name_str: fs_path.file_name(),
                file_name_hash: file_path_hash,
                query_str: query,
                file_path: fs_path.clone(),
                source,
                source_text: &fm.src,
                node_env,
                browser_jsx_imports: browser_jsx_imports.as_ref(),
            };
            let span = tracing::trace_span!("transforms");
            async {
                for transform in transforms.iter() {
                    helpers = transform
                        .apply(&mut parsed_program, &transform_context, helpers)
                        .await?;
                }
                anyhow::Ok(())
            }
            .instrument(span)
            .await?;

            if parser_handler.has_errors() {
                let messages = if let Some(error) = collector_parse.last_emitted_issue() {
                    Some(vec![error.await?.message.clone()])
                } else {
                    None
                };
                let messages = Some(messages.unwrap_or_else(|| vec![fm.src.clone().into()]));
                return Ok(ParseResult::Unparsable { messages });
            }

            let helpers = Helpers::from_data(helpers);
            HELPERS.set(&helpers, || {
                parsed_program.mutate(swc_core::ecma::transforms::base::helpers::inject_helpers(
                    unresolved_mark,
                ));
            });

            let eval_context = EvalContext::new(
                Some(&parsed_program),
                unresolved_mark,
                top_level_mark,
                Arc::new(var_with_ts_declare),
                Some(&comments),
            );

            let (comments, source_mapping_url) =
                ImmutableComments::new_with_source_mapping_url(comments);

            Ok::<ParseResult, anyhow::Error>(ParseResult::Ok {
                program: parsed_program,
                comments: Arc::new(comments),
                eval_context,
                // Temporary globals as the current one can't be moved yet, since they are
                // borrowed
                globals: Arc::new(Globals::new()),
                source_map,
                source_mapping_url: source_mapping_url.map(|s| s.into()),
                program_source,
                browser_jsx_imports: browser_jsx_imports
                    .map(|imports| {
                        imports
                            .into_inner()
                            .expect("owned Browser JSX import collector")
                    })
                    .unwrap_or_default(),
            })
        },
        |f, cx| GLOBALS.set(globals_ref, || HANDLER.set(&handler, || f.poll(cx))),
    )
    .await?;
    if let ParseResult::Ok {
        globals: ref mut g, ..
    } = result
    {
        // Assign the correct globals
        *g = globals;
    }
    collector.emit(loose_errors).await?;
    collector_parse.emit(loose_errors).await?;
    Ok(result.cell())
}

#[turbo_tasks::value]
struct ReadSourceIssue {
    source: IssueSource,
    error: RcStr,
    severity: IssueSeverity,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for ReadSourceIssue {
    async fn file_path(&self) -> Result<FileSystemPath> {
        self.source.file_path().await
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!(
            "Reading source code for parsing failed"
        )))
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Text(
            format!(
                "An unexpected error happened while trying to read the source code to parse: {}",
                self.error
            )
            .into(),
        )))
    }

    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Load
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.source)
    }
}

struct VarDeclWithTsDeclareCollector {
    id_with_no_ts_declare: FxHashSet<Id>,
    id_with_ts_declare: FxHashSet<Id>,
}

impl VarDeclWithTsDeclareCollector {
    fn collect<N: VisitWith<VarDeclWithTsDeclareCollector>>(n: &N) -> FxHashSet<Id> {
        let mut collector = VarDeclWithTsDeclareCollector {
            id_with_no_ts_declare: Default::default(),
            id_with_ts_declare: Default::default(),
        };
        n.visit_with(&mut collector);
        collector
            .id_with_ts_declare
            .retain(|id| !collector.id_with_no_ts_declare.contains(id));
        collector.id_with_ts_declare
    }

    fn handle_pat(&mut self, pat: &Pat, declare: bool) {
        match pat {
            Pat::Ident(binding_ident) => {
                if declare {
                    self.id_with_ts_declare.insert(binding_ident.to_id());
                } else {
                    self.id_with_no_ts_declare.insert(binding_ident.to_id());
                }
            }
            Pat::Array(array_pat) => {
                for pat in array_pat.elems.iter().flatten() {
                    self.handle_pat(pat, declare);
                }
            }
            Pat::Object(object_pat) => {
                for prop in object_pat.props.iter() {
                    match prop {
                        ObjectPatProp::KeyValue(key_value_pat_prop) => {
                            self.handle_pat(&key_value_pat_prop.value, declare);
                        }
                        ObjectPatProp::Assign(assign_pat_prop) => {
                            if declare {
                                self.id_with_ts_declare.insert(assign_pat_prop.key.to_id());
                            } else {
                                self.id_with_no_ts_declare
                                    .insert(assign_pat_prop.key.to_id());
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }
}

impl Visit for VarDeclWithTsDeclareCollector {
    noop_visit_type!();

    fn visit_var_decl(&mut self, node: &VarDecl) {
        for decl in node.decls.iter() {
            self.handle_pat(&decl.name, node.declare);
        }
    }

    fn visit_ts_module_decl(&mut self, node: &TsModuleDecl) {
        if node.declare
            && let TsModuleName::Ident(id) = &node.id
        {
            self.id_with_ts_declare.insert(id.to_id());
        }
    }
}

/// Re-parses a module directly from saved bytes, bypassing `source.content()`.
///
/// Used by `failsafe_parse` to serve the last good AST when the live file has a syntax error.
pub async fn parse_from_rope(
    rope: Rope,
    source: ResolvedVc<Box<dyn Source>>,
    ty: EcmascriptModuleAssetType,
    transforms: ResolvedVc<EcmascriptInputTransforms>,
    node_env: RcStr,
) -> Result<Vc<ParseResult>> {
    parse_from_rope_with_module_grammar(rope, source, ty, transforms, node_env, false).await
}

pub async fn parse_from_rope_with_module_grammar(
    rope: Rope,
    source: ResolvedVc<Box<dyn Source>>,
    ty: EcmascriptModuleAssetType,
    transforms: ResolvedVc<EcmascriptInputTransforms>,
    node_env: RcStr,
    parse_as_module: bool,
) -> Result<Vc<ParseResult>> {
    let ident_vc = source.ident();
    let ident_ref = ident_vc.await?;
    let ident = &*ident_vc.to_string().await?;
    let file_path_hash = hash_xxh3_hash64(ident) as u128;
    let query = ident_ref.query.clone();
    let transforms = &*transforms.await?;
    parse_file_content(
        rope,
        &ident_ref.path,
        ident,
        query,
        file_path_hash,
        source,
        ty,
        transforms,
        node_env,
        false,
        false,
        parse_as_module,
    )
    .await
}

#[cfg(test)]
mod tests {
    use swc_core::{
        common::{FileName, GLOBALS, SourceMap, sync::Lrc},
        ecma::parser::{Parser, Syntax, TsSyntax, lexer::Lexer},
    };

    use super::VarDeclWithTsDeclareCollector;

    fn parse_and_collect(code: &str) -> Vec<String> {
        GLOBALS.set(&Default::default(), || {
            let cm: Lrc<SourceMap> = Default::default();
            let fm = cm.new_source_file(FileName::Anon.into(), code.to_string());

            let lexer = Lexer::new(
                Syntax::Typescript(TsSyntax {
                    tsx: false,
                    decorators: true,
                    ..Default::default()
                }),
                Default::default(),
                (&*fm).into(),
                None,
            );

            let mut parser = Parser::new_from(lexer);
            let module = parser.parse_module().expect("Failed to parse");

            let ids = VarDeclWithTsDeclareCollector::collect(&module);
            let mut result: Vec<_> = ids.iter().map(|id| id.0.to_string()).collect();
            result.sort();
            result
        })
    }

    #[test]
    fn test_collect_declare_const() {
        let ids = parse_and_collect("declare const Foo: number;");
        assert_eq!(ids, vec!["Foo"]);
    }

    #[test]
    fn test_collect_declare_global() {
        let ids = parse_and_collect("declare global {}");
        assert_eq!(ids, vec!["global"]);
    }

    #[test]
    fn test_collect_declare_global_with_content() {
        let ids = parse_and_collect(
            r#"
            declare global {interface Window {foo: string;}}
            "#,
        );
        assert_eq!(ids, vec!["global"]);
    }

    #[test]
    fn test_collect_multiple_declares() {
        let ids = parse_and_collect(
            r#"
            declare const Foo: number;
            declare global {}
            declare const Bar: string;
            "#,
        );
        assert_eq!(ids, vec!["Bar", "Foo", "global"]);
    }

    #[test]
    fn test_no_collect_non_declare() {
        let ids = parse_and_collect("const Foo = 1;");
        assert!(ids.is_empty());
    }

    #[test]
    fn test_collect_declare_namespace() {
        // `declare namespace Foo {}` should also be collected
        let ids = parse_and_collect("declare namespace Foo {}");
        assert_eq!(ids, vec!["Foo"]);
    }
}

#[cfg(test)]
mod unmapped_native_tests {
    use std::sync::Arc;

    use swc_core::{
        base::SwcComments,
        common::{
            BytePos, FileName, GLOBALS, Globals, LineCol, SourceMap,
            source_map::DefaultSourceMapGenConfig,
        },
        ecma::{
            ast::{Module, ModuleDecl, ModuleItem, Stmt},
            codegen::{Emitter, text_writer::JsWriter},
            parser::{Parser, StringInput, Syntax},
        },
        quote,
    };

    use crate::runtime_functions::TURBOPACK_ESM;

    fn insert_unmapped_segments(
        map: swc_sourcemap::SourceMap,
        positions: &[LineCol],
    ) -> swc_sourcemap::SourceMap {
        let map = super::StructuredSourceMap::from_swc_map(map)
            .unwrap()
            .with_unmapped_segments(
                &positions
                    .iter()
                    .map(|position| (position.line, position.col))
                    .collect::<Vec<_>>(),
            )
            .unwrap();
        swc_sourcemap::SourceMap::from_slice(&map.to_rope().to_bytes()).unwrap()
    }

    const SOURCE: &str = "/* first real comment */\n/* second real comment */\nexport function \
                          authored() { return actualFactory(); }\n";

    fn position(text: &str, needle: &str) -> (u32, u32) {
        let prefix = &text[..text.find(needle).expect("emitted fragment")];
        let line = prefix.bytes().filter(|byte| *byte == b'\n').count() as u32;
        let column = prefix.rsplit('\n').next().unwrap().encode_utf16().count() as u32;
        (line, column)
    }

    fn emit(
        source_map: Arc<SourceMap>,
        module: &Module,
        comments: &SwcComments,
        minify: bool,
    ) -> (String, swc_sourcemap::SourceMap) {
        let comments = SwcComments {
            leading: Arc::new((*comments.leading).clone()),
            trailing: Arc::new((*comments.trailing).clone()),
        };
        let mut output = Vec::new();
        let mut mappings = Vec::new();
        {
            let mut emitter = Emitter {
                cfg: swc_core::ecma::codegen::Config::default().with_minify(minify),
                cm: source_map.clone(),
                comments: Some(&comments),
                wr: JsWriter::new(source_map.clone(), "\n", &mut output, Some(&mut mappings)),
            };
            emitter.emit_module(module).expect("emit module");
        }
        let unmapped = mappings
            .iter()
            .filter_map(|(position, generated)| {
                (*position == BytePos::PLACEHOLDER).then_some(*generated)
            })
            .collect::<Vec<LineCol>>();
        let map = source_map.build_source_map(&mappings, None, DefaultSourceMapGenConfig);
        (
            String::from_utf8(output).unwrap(),
            insert_unmapped_segments(map, &unmapped),
        )
    }

    fn assert_boundaries(output: &str, map: &swc_sourcemap::SourceMap) {
        assert!(
            output.find("/* second real comment */").unwrap()
                < output.find("__turbopack_context__.s").unwrap()
        );
        let (line, column) = position(output, "__turbopack_context__.s");
        let token = map.lookup_token(line, column).expect("native boundary");
        assert_eq!((token.get_dst_line(), token.get_dst_col()), (line, column));
        assert!(
            !token.has_source(),
            "registration inherited a real comment mapping"
        );

        let (line, column) = position(output, "/* second real comment */");
        assert!(map.lookup_token(line, column).unwrap().has_source());
        let (line, column) = position(output, "actualFactory");
        let token = map.lookup_token(line, column).expect("real factory call");
        assert!(token.has_source());
        assert_eq!(token.get_src_line(), 2);
        assert_eq!(
            token.get_src_col(),
            SOURCE
                .lines()
                .nth(2)
                .unwrap()
                .find("actualFactory")
                .unwrap() as u32
        );
    }

    #[test]
    fn native_registration_is_unmapped_after_real_comments() {
        GLOBALS.set(&Globals::new(), || {
            let source_map: Arc<SourceMap> = Default::default();
            let source = source_map.new_source_file(FileName::Custom("authored.js".into()).into(), SOURCE);
            let comments = SwcComments::default();
            let mut parser = Parser::new(Syntax::Es(Default::default()), StringInput::from(&*source), Some(&comments));
            let mut module = parser.parse_module().expect("valid module");
            // Match native ESM lowering: the original export wrapper is gone,
            // while its function and real leading comments retain their spans.
            module.body = module.body.into_iter().map(|item| match item {
                ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(export)) => ModuleItem::Stmt(Stmt::Decl(export.decl)),
                item => item,
            }).collect();
            module.body.insert(0, ModuleItem::Stmt(quote!("$register([]);" as Stmt, register: Expr = TURBOPACK_ESM.unmapped_expr())));
            for minify in [false, true] {
                let (output, map) = emit(source_map.clone(), &module, &comments, minify);
                assert_boundaries(&output, &map);

                let mut upstream = swc_sourcemap::SourceMapBuilder::new(None);
                let id = upstream.add_source("original.js".into());
                upstream.set_source_contents(id, Some(SOURCE.into()));
                for (line, source) in SOURCE.lines().enumerate() {
                    for column in 0..=source.encode_utf16().count() {
                        upstream.add_raw(line as u32, column as u32, line as u32, column as u32, Some(id), None, false);
                    }
                }
                let mut bytes = Vec::new();
                upstream.into_sourcemap().to_writer(&mut bytes).unwrap();
                let mut upstream = swc_sourcemap::lazy::decode(&bytes).unwrap().into_source_map().unwrap();
                let mut adjustment = swc_sourcemap::SourceMapBuilder::new(None);
                for token in map.tokens().filter(|token| token.has_source()) { adjustment.add_token(&token, true); }
                upstream.adjust_mappings(adjustment.into_sourcemap());
                let composed = swc_sourcemap::SourceMap::from_slice(&serde_json::to_vec(&upstream.into_raw_sourcemap()).unwrap()).unwrap();
                let (native_line, native_column) = position(&output, "__turbopack_context__.s");
                let composed = insert_unmapped_segments(composed, &[LineCol { line: native_line, col: native_column }]);
                assert_boundaries(&output, &composed);
                let (line, column) = position(&output, "actualFactory");
                assert_eq!(composed.lookup_token(line, column).unwrap().get_source().unwrap(), "original.js");
            }
        });
    }

    #[test]
    fn native_unmapped_boundary_survives_subsequent_minification() {
        GLOBALS.set(&Globals::new(), || {
            let source_map: Arc<SourceMap> = Default::default();
            let source = source_map.new_source_file(FileName::Custom("authored.js".into()).into(), SOURCE);
            let comments = SwcComments::default();
            let mut parser = Parser::new(Syntax::Es(Default::default()), StringInput::from(&*source), Some(&comments));
            let mut module = parser.parse_module().expect("valid module");
            // Match native ESM lowering: the original export wrapper is gone,
            // while its function and real leading comments retain their spans.
            module.body = module.body.into_iter().map(|item| match item {
                ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(export)) => ModuleItem::Stmt(Stmt::Decl(export.decl)),
                item => item,
            }).collect();
            module.body.insert(0, ModuleItem::Stmt(quote!("$register([]);" as Stmt, register: Expr = TURBOPACK_ESM.unmapped_expr())));
            let (intermediate, mut original_map) = emit(source_map, &module, &comments, false);
            let minify_map: Arc<SourceMap> = Default::default();
            let source = minify_map.new_source_file(FileName::Custom("intermediate.js".into()).into(), intermediate);
            let comments = SwcComments::default();
            let mut parser = Parser::new(Syntax::Es(Default::default()), StringInput::from(&*source), Some(&comments));
            let module = parser.parse_module().expect("emitted module");
            let (output, adjustment) = emit(minify_map, &module, &comments, true);
            original_map.adjust_mappings(&adjustment);
            assert_boundaries(&output, &original_map);
        });
    }

    #[test]
    fn duplicate_unmapped_boundaries_replace_the_zero_position_once() {
        let mut builder = swc_sourcemap::SourceMapBuilder::new(None);
        let id = builder.add_source("authored.js".into());
        builder.set_source_contents(id, Some("value".into()));
        let name = builder.add_name("value".into());
        builder.add_to_ignore_list(id);
        builder.add_raw(0, 0, 0, 0, Some(id), Some(name), false);
        builder.add_raw(0, 2, 0, 2, Some(id), Some(name), false);
        let map = insert_unmapped_segments(
            builder.into_sourcemap(),
            &[LineCol { line: 0, col: 0 }, LineCol { line: 0, col: 0 }],
        );
        let tokens = map.tokens().collect::<Vec<_>>();
        assert_eq!(tokens.len(), 2);
        assert!(!tokens[0].has_source());
        assert_eq!(tokens[1].get_source().unwrap(), "authored.js");
        assert_eq!(tokens[1].get_name().unwrap(), "value");
        assert_eq!(map.get_source_contents(0).unwrap(), "value");
        assert_eq!(map.ignore_list().copied().collect::<Vec<_>>(), vec![0]);
    }
}

#[cfg(test)]
mod browser_module_parse_tests {
    use swc_core::{
        common::{FileName, GLOBALS, Mark, SourceMap, sync::Lrc},
        ecma::{
            ast::{Decl, Expr, ModuleItem, Program, Stmt},
            parser::{Parser, StringInput, Syntax, lexer::Lexer},
            transforms::base::resolver,
            visit::VisitMutWith,
        },
    };

    fn parse(source: &str, as_module: bool) -> (Option<Program>, bool) {
        let cm: Lrc<SourceMap> = Default::default();
        let source = cm.new_source_file(FileName::Anon.into(), source.to_owned());
        let lexer = Lexer::new(
            Syntax::Es(Default::default()),
            Default::default(),
            StringInput::from(&*source),
            None,
        );
        let mut parser = Parser::new_from(lexer);
        let program = super::parse_program(&mut parser, as_module);
        let valid = program.is_ok() && parser.take_errors().is_empty();
        (program.ok(), valid)
    }

    #[test]
    fn no_import_esm_keeps_strict_block_bindings_before_creator_instrumentation() {
        GLOBALS.set(&Default::default(), || {
            let (program, valid) = parse(
                "{ function block() {} block(); } typeof block; test('global', () => {});",
                true,
            );
            assert!(valid);
            let mut program = program.expect("valid source");
            program.visit_mut_with(&mut resolver(Mark::new(), Mark::new(), false));
            let Program::Module(module) = program else {
                panic!("resolved ESM was parsed as a script");
            };
            let ModuleItem::Stmt(Stmt::Block(block)) = &module.body[0] else {
                panic!("original block missing");
            };
            let Stmt::Decl(Decl::Fn(function)) = &block.stmts[0] else {
                panic!("original function missing");
            };
            let ModuleItem::Stmt(Stmt::Expr(expression)) = &module.body[1] else {
                panic!("original outer reference missing");
            };
            let Expr::Unary(expression) = &*expression.expr else {
                panic!("original typeof missing");
            };
            let Expr::Ident(outer) = &*expression.arg else {
                panic!("original outer identifier missing");
            };
            assert_eq!(function.ident.sym, outer.sym);
            assert_ne!(function.ident.ctxt, outer.ctxt);
        });
    }

    #[test]
    fn resolved_esm_enforces_strict_grammar_without_changing_script_mode() {
        GLOBALS.set(&Default::default(), || {
            let source = "with (scope) {}";
            let (script, valid) = parse(source, false);
            assert!(valid);
            assert!(matches!(script, Some(Program::Script(_))));
            assert!(!parse(source, true).1);
        });
    }
}

#[cfg(test)]
mod removed_comment_source_map_tests {
    use std::sync::Arc;

    use swc_core::{
        base::SwcComments,
        common::{FileName, SourceMap},
        ecma::{
            codegen::{Emitter, text_writer::JsWriter},
            parser::{Parser, StringInput, Syntax},
        },
    };
    use turbo_tasks_fs::rope::Rope;

    const SOURCE: &str = "function observe(listener) {\nreturn ((// A long inline parameter \
                          comment whose removed end must not become a generated column.\n{}, \
                          suite) => listener(suite));\n}\n";

    fn position(source: &str, needle: &str) -> (u32, u32) {
        let prefix = &source[..source.find(needle).unwrap()];
        (
            prefix.bytes().filter(|byte| *byte == b'\n').count() as u32,
            prefix.rsplit('\n').next().unwrap().encode_utf16().count() as u32,
        )
    }

    #[test]
    fn removed_inline_parameter_comment_does_not_extrapolate_upstream_mappings() {
        let source_map = Arc::<SourceMap>::default();
        let file = source_map.new_source_file(
            FileName::Custom("intermediate.js".into()).into(),
            SOURCE.to_string(),
        );
        let comments = SwcComments::default();
        let module = Parser::new(
            Syntax::Es(Default::default()),
            StringInput::from(&*file),
            Some(&comments),
        )
        .parse_module()
        .unwrap();
        let comments = crate::swc_comments::ImmutableComments::new(comments);
        let comments = comments.consumable();
        let mut output = Vec::new();
        let mut mappings = Vec::new();
        Emitter {
            cfg: Default::default(),
            cm: source_map.clone(),
            comments: Some(&comments),
            wr: JsWriter::new(source_map.clone(), "\n", &mut output, Some(&mut mappings)),
        }
        .emit_module(&module)
        .unwrap();
        let output = String::from_utf8(output).unwrap();
        assert!(!output.contains("long inline parameter comment"));

        // A real upstream map can have boundaries anywhere inside a comment.
        // Dense mappings also cover its start/end and all surrounding tokens.
        let mut upstream = swc_sourcemap::SourceMapBuilder::new(None);
        let source = upstream.add_source("authored.js".into());
        upstream.set_source_contents(source, Some(SOURCE.into()));
        upstream.add_to_ignore_list(source);
        let listener = upstream.add_name("listener".into());
        let call = position(SOURCE, "listener(suite)");
        let anchors = [
            position(SOURCE, "function"),
            position(SOURCE, "observe"),
            position(SOURCE, "listener) {"),
            position(SOURCE, "{}"),
            position(SOURCE, "suite) =>"),
            call,
            position(SOURCE, "suite));"),
            position(SOURCE, "}\n"),
        ];
        for (line, text) in SOURCE.split('\n').enumerate() {
            for column in 0..=text.encode_utf16().count() {
                let comment = line == 1 && column >= text.find("//").unwrap();
                if !comment && !anchors.contains(&(line as u32, column as u32)) {
                    continue;
                }
                upstream.add_raw(
                    line as u32,
                    column as u32,
                    line as u32,
                    column as u32,
                    Some(source),
                    ((line as u32, column as u32) == call).then_some(listener),
                    false,
                );
            }
        }
        let mut upstream_bytes = Vec::new();
        upstream
            .into_sourcemap()
            .to_writer(&mut upstream_bytes)
            .unwrap();
        let upstream = Rope::from(upstream_bytes);
        let composed = super::generate_js_source_map(
            &*source_map,
            mappings,
            [&upstream],
            true,
            true,
            Default::default(),
            &comments.remaining_comment_spans(),
        )
        .unwrap();
        let composed =
            swc_sourcemap::SourceMap::from_slice(&composed.to_rope().to_bytes()).unwrap();
        let lines = output.split('\n').collect::<Vec<_>>();
        for token in composed.tokens() {
            let line = lines
                .get(token.get_dst_line() as usize)
                .expect("emitted line");
            assert!(
                token.get_dst_col() as usize <= line.encode_utf16().count(),
                "mapping exceeds actual emitted code: {token:?}; {output:?}"
            );
        }
        let call = position(&output, "listener(suite)");
        let token = composed.lookup_token(call.0, call.1).unwrap();
        assert_eq!(token.get_src(), position(SOURCE, "listener(suite)"));
        assert_eq!(token.get_name().map(|name| name.as_str()), Some("listener"));
        assert_eq!(
            composed.get_source_contents(0).map(|text| text.as_str()),
            Some(SOURCE)
        );
        assert!(composed.ignore_list().any(|source| *source == 0));
        let parameter = position(&output, "{}");
        assert_eq!(
            composed
                .lookup_token(parameter.0, parameter.1)
                .unwrap()
                .get_src(),
            position(SOURCE, "{}")
        );
    }

    #[test]
    fn removed_comment_rewrite_retains_raw_fields_range_flags_and_following_token() {
        use std::collections::BTreeMap;

        use serde_json::value::RawValue;

        let original = br#"{"version":3,"file":"intermediate.js","sourceRoot":"raw/","sources":["a\u002ejs",7],"sourcesContent":["x\ud800y",null],"names":["n\u0061me"],"mappings":"AAAAA,CAAC,CAAC;AACF","rangeMappings":"C;B","ignoreList":[0]}"#;
        for indexed in [false, true] {
            let input = if indexed {
                let mut input =
                    br#"{"version":3,"sources":[],"sections":[{"offset":{"line":2,"column":3},"map":"#.to_vec();
                input.extend_from_slice(original);
                input.extend_from_slice(b"}]}");
                input
            } else {
                original.to_vec()
            };
            let range = if indexed {
                ((2, 4), (2, 5))
            } else {
                ((0, 1), (0, 2))
            };
            let rewritten = super::remove_collapsed_comment_mappings(&input, &[range]).unwrap();
            let fields: BTreeMap<String, Box<RawValue>> =
                serde_json::from_slice(&rewritten).unwrap();
            let fields = if indexed {
                let sections: Vec<BTreeMap<String, Box<RawValue>>> =
                    serde_json::from_str(fields["sections"].get()).unwrap();
                serde_json::from_str::<BTreeMap<String, Box<RawValue>>>(sections[0]["map"].get())
                    .unwrap()
            } else {
                fields
            };
            let original: BTreeMap<String, Box<RawValue>> =
                serde_json::from_slice(original).unwrap();
            for key in [
                "file",
                "sourceRoot",
                "sources",
                "sourcesContent",
                "names",
                "ignoreList",
            ] {
                assert_eq!(fields[key].get(), original[key].get(), "raw {key}");
            }
            let map = serde_json::json!({"version":3,"sources":["first","second"],"names":["name"],"mappings":fields["mappings"],"rangeMappings":fields["rangeMappings"]});
            let map =
                swc_sourcemap::SourceMap::from_slice(&serde_json::to_vec(&map).unwrap()).unwrap();
            assert_eq!(
                map.tokens()
                    .map(|token| (token.get_dst(), token.is_range()))
                    .collect::<Vec<_>>(),
                vec![((0, 0), false), ((0, 2), false), ((1, 0), true)]
            );
            assert_eq!(map.get_token(0).unwrap().get_name_id(), 0);
        }
    }

    #[test]
    fn removed_comment_rewrite_retains_optional_field_defaults_and_noop_bytes() {
        use std::collections::BTreeMap;

        use serde_json::value::RawValue;

        let original = br#"{
  "sources": ["authored.js"],
  "mappings": "AAAA,CAAC,CAAC"
}"#;
        // names, mappings, and all other serde-defaulted regular-map fields may
        // be omitted. sources remains required by the existing lazy decoder.
        let without_mappings = br#"{ "sources": [] }"#;
        for input in [original.as_slice(), without_mappings.as_slice()] {
            assert!(
                swc_sourcemap::lazy::decode(input)
                    .unwrap()
                    .into_source_map()
                    .is_ok()
            );
            assert_eq!(
                super::remove_collapsed_comment_mappings(input, &[((10, 0), (11, 0))]).unwrap(),
                input
            );
        }
        let rewritten =
            super::remove_collapsed_comment_mappings(original, &[((0, 1), (0, 2))]).unwrap();
        let before: BTreeMap<String, Box<RawValue>> = serde_json::from_slice(original).unwrap();
        let after: BTreeMap<String, Box<RawValue>> = serde_json::from_slice(&rewritten).unwrap();
        assert_eq!(
            before.keys().collect::<Vec<_>>(),
            after.keys().collect::<Vec<_>>()
        );
        assert_eq!(before["sources"].get(), after["sources"].get());
        assert!(!after.contains_key("names"));
        let map =
            serde_json::json!({"version":3,"sources":["authored.js"],"mappings":after["mappings"]});
        let map = swc_sourcemap::SourceMap::from_slice(&serde_json::to_vec(&map).unwrap()).unwrap();
        assert_eq!(
            map.tokens()
                .map(|token| token.get_dst())
                .collect::<Vec<_>>(),
            vec![(0, 0), (0, 2)]
        );
        assert!(super::remove_collapsed_comment_mappings(br#"{}"#, &[((0, 1), (0, 2))]).is_err());

        let indexed = br#"{ "version":3, "sources":[], "sections":[{"offset":{"line":2,"column":3},"map":{"sources":["authored.js"],"mappings":"AAAA"}}] }"#;
        assert_eq!(
            super::remove_collapsed_comment_mappings(indexed, &[((10, 0), (11, 0))]).unwrap(),
            indexed
        );
    }

    #[test]
    fn removed_comment_stream_preserves_lazy_field_shapes_and_nonmapping_bytes() {
        let base = serde_json::json!({"version":3,"sources":["authored.js"],"names":[],"mappings":"AAAA,CAAC,CAAC"});
        let fields = [
            ("version", serde_json::json!(3)),
            ("file", serde_json::json!("intermediate.js")),
            ("sources", serde_json::json!(["authored.js"])),
            ("sourceRoot", serde_json::json!("raw/")),
            ("sourcesContent", serde_json::json!(["source"])),
            ("sections", serde_json::json!([])),
            ("names", serde_json::json!([])),
            ("scopes", serde_json::json!("scopes")),
            ("rangeMappings", serde_json::json!("A")),
            ("mappings", serde_json::json!("AAAA,CAAC,CAAC")),
            ("ignoreList", serde_json::json!([0])),
        ];
        for (field, valid) in fields {
            for (shape, value) in [
                ("absent", None),
                ("null", Some(serde_json::Value::Null)),
                ("valid", Some(valid)),
                ("other shape", Some(serde_json::json!({"raw":7}))),
            ] {
                let mut input = base.clone();
                let object = input.as_object_mut().unwrap();
                if let Some(value) = value {
                    object.insert(field.into(), value);
                } else {
                    object.remove(field);
                }
                let input = serde_json::to_vec(&input).unwrap();
                let accepted = swc_sourcemap::lazy::decode(&input)
                    .and_then(|map| map.into_source_map())
                    .is_ok();
                let rewritten =
                    super::remove_collapsed_comment_mappings(&input, &[((0, 1), (0, 2))]);
                assert_eq!(rewritten.is_ok(), accepted, "{field}: {shape}");
                if accepted {
                    let rewritten = rewritten.unwrap();
                    assert!(
                        swc_sourcemap::lazy::decode(&rewritten)
                            .and_then(|map| map.into_source_map())
                            .is_ok(),
                        "{field}: {shape}"
                    );
                    assert_eq!(
                        super::remove_collapsed_comment_mappings(&input, &[((10, 0), (11, 0))])
                            .unwrap(),
                        input,
                        "no-op {field}: {shape}"
                    );
                }
            }
        }
        let original = br#"{
  "version": 3, "sources" : [ "authored.js" ],
  "sourcesContent": ["x\ud800y"],
  "mappings" : "AAAA,CAAC,CAAC",
  "unknown" : { "literal" : "\u0061" }
}"#;
        let expected = std::str::from_utf8(original)
            .unwrap()
            .replace("AAAA,CAAC,CAAC", "AAAA,EAAE");
        assert_eq!(
            super::remove_collapsed_comment_mappings(original, &[((0, 1), (0, 2))]).unwrap(),
            expected.as_bytes()
        );
        let mut prefixed = b")]}'\n".to_vec();
        prefixed.extend_from_slice(original);
        let mut expected_prefix = b")]}'\n".to_vec();
        expected_prefix.extend_from_slice(expected.as_bytes());
        assert_eq!(
            super::remove_collapsed_comment_mappings(&prefixed, &[((0, 1), (0, 2))]).unwrap(),
            expected_prefix
        );
    }

    #[test]
    fn removed_comment_stream_preserves_deltas_unmapped_duplicates_and_range_flags() {
        let mut original = swc_sourcemap::SourceMapBuilder::new(None);
        let first = original.add_source("first.js".into());
        let second = original.add_source("second.js".into());
        let a = original.add_name("a".into());
        let b = original.add_name("b".into());
        original.add_raw(0, 0, 0, 0, Some(first), Some(a), false);
        original.add_raw(0, 1, 3, 7, Some(second), Some(b), true);
        original.add_raw(0, 2, 0, 0, None, None, false);
        original.add_raw(0, 2, 5, 9, Some(second), Some(a), true);
        original.add_raw(0, 4, 7, 11, Some(first), Some(b), false);
        original.add_raw(1, 0, 10, 12, Some(second), Some(b), true);
        original.add_raw(1, 2, 11, 3, Some(first), Some(a), false);
        let mut bytes = Vec::new();
        original.into_sourcemap().to_writer(&mut bytes).unwrap();
        let mut original: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        // Supply correct first-token flags without depending on the library's
        // separate row-transition encoder behavior.
        original["rangeMappings"] = serde_json::json!("K;B");
        let mappings = original["mappings"].as_str().unwrap().to_string() + ",AAAAA";
        original["mappings"] = serde_json::json!(mappings);
        let original = serde_json::to_vec(&original).unwrap();
        let decoded = swc_sourcemap::SourceMap::from_slice(&original).unwrap();
        let expected = decoded
            .tokens()
            .filter(|token| token.get_dst() != (0, 1))
            .map(|token| token.get_raw_token())
            .collect::<Vec<_>>();
        let rewritten =
            super::remove_collapsed_comment_mappings(&original, &[((0, 1), (0, 2))]).unwrap();
        let rewritten = swc_sourcemap::SourceMap::from_slice(&rewritten).unwrap();
        assert_eq!(
            rewritten
                .tokens()
                .map(|token| token.get_raw_token())
                .collect::<Vec<_>>(),
            expected
        );
        assert_eq!(rewritten.lookup_token(1, 0).unwrap().is_range(), true);
        assert_eq!(
            rewritten
                .tokens()
                .filter(|token| token.get_dst() == (0, 2))
                .count(),
            2
        );
        assert_eq!(
            rewritten
                .tokens()
                .filter(|token| token.get_dst() == (1, 2))
                .count(),
            2
        );
        let descending =
            br#"{ "sources":["authored.js"], "mappings":"GAAA,FAAA", "rangeMappings":"C" }"#;
        assert!(
            swc_sourcemap::lazy::decode(descending)
                .unwrap()
                .into_source_map()
                .is_ok()
        );
        let rewritten =
            super::remove_collapsed_comment_mappings(descending, &[((0, 1), (0, 2))]).unwrap();
        let rewritten = swc_sourcemap::SourceMap::from_slice(&rewritten).unwrap();
        assert_eq!(
            rewritten
                .tokens()
                .map(|token| token.get_dst())
                .collect::<Vec<_>>(),
            vec![(0, 3)]
        );
    }
}
