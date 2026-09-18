//! Node test-only replacement sources. The caller supplies targets resolved by
//! the actual Next context, and owns framework/external/cycle boundary checks.

use anyhow::{Context, Result, bail};
use data_encoding::BASE64;
use swc_sourcemap::SourceMapBuilder;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{
    FileSystemPath,
    glob::{Glob, GlobOptions},
};
use turbopack_core::{
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::{
        ResolveResult, ResolveResultOption,
        parse::Request,
        plugin::{AfterResolvePlugin, AfterResolvePluginCondition},
    },
    source::Source,
};

#[turbo_tasks::value(shared)]
pub(crate) struct MockGraphTarget {
    pub path: FileSystemPath,
    pub original_request: RcStr,
    pub wrapper_source: ResolvedVc<Box<dyn Source>>,
}

#[turbo_tasks::value(transparent)]
pub(crate) struct MockGraphTargets(pub Vec<ResolvedVc<MockGraphTarget>>);

#[turbo_tasks::value]
pub(crate) struct MockResolvePlugin {
    targets: ResolvedVc<MockGraphTargets>,
    condition: ResolvedVc<AfterResolvePluginCondition>,
}

#[turbo_tasks::value_impl]
impl MockResolvePlugin {
    #[turbo_tasks::function]
    pub async fn new(targets: ResolvedVc<MockGraphTargets>) -> Result<Vc<Self>> {
        let targets_value = targets.await?;
        let first = targets_value
            .first()
            .context("Mock resolver requires at least one target")?
            .await?;
        let condition = AfterResolvePluginCondition::new_with_glob(
            first.path.root().owned().await?,
            Glob::new(rcstr!("**"), GlobOptions::default()),
        )
        .to_resolved()
        .await?;
        Ok(Self { targets, condition }.cell())
    }
}

#[turbo_tasks::value_impl]
impl AfterResolvePlugin for MockResolvePlugin {
    fn after_resolve_condition(&self) -> Vc<AfterResolvePluginCondition> {
        *self.condition
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        self: Vc<Self>,
        fs_path: FileSystemPath,
        _lookup_path: FileSystemPath,
        reference_type: ReferenceType,
        request: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        let this = self.await?;
        let request = request.await?;
        let original_request = request.request();
        for target in &*this.targets.await? {
            let target = target.await?;
            if target.path != fs_path {
                continue;
            }
            if matches!(&*request,
                Request::Raw { query, fragment, .. } |
                Request::Relative { query, fragment, .. } |
                Request::Module { query, fragment, .. } |
                Request::ServerRelative { query, fragment, .. } |
                Request::Windows { query, fragment, .. } |
                Request::Uri { query, fragment, .. }
                if !query.is_empty() || !fragment.is_empty()
            ) {
                return Err(crate::testing::test_input_error(
                    fs_path.clone(),
                    "Module mock targets with query strings or fragments are unsupported",
                ));
            }
            if !matches!(
                reference_type,
                ReferenceType::EcmaScriptModules(
                    EcmaScriptModulesReferenceSubType::Import
                        | EcmaScriptModulesReferenceSubType::ImportPart(_)
                        | EcmaScriptModulesReferenceSubType::DynamicImport
                        | EcmaScriptModulesReferenceSubType::Undefined
                )
            ) {
                return Err(crate::testing::test_input_error(
                    fs_path.clone(),
                    "Module mock targets require normal ESM imports; CommonJS and import \
                     attributes are unsupported",
                ));
            }
            // ImportMap::Direct still passes through after-resolve plugins.
            // Bypass this one compiler-issued edge, not the original module's
            // context: ordinary imports from the original remain substituted.
            if original_request.as_ref() == Some(&target.original_request) {
                return Ok(Vc::cell(None));
            }
            return Ok(Vc::cell(Some(
                ResolveResult::source(target.wrapper_source).resolved_cell(),
            )));
        }
        Ok(Vc::cell(None))
    }
}

pub(crate) struct MockRegistrationSource<'a> {
    pub key: &'a str,
    pub factory_source: &'a str,
    pub factory_start: usize,
    pub original_request: &'a str,
}

/// Load this module before the stripped spec. Dynamic original imports must
/// remain deferred until a factory invokes its supplied importOriginal helper.
pub(crate) fn mock_registration_source(
    runtime_request: &str,
    original_path: &str,
    original_source: &str,
    declarations: &[MockRegistrationSource<'_>],
) -> Result<String> {
    let mut source = String::new();
    let mut generated = SourcePosition::default();
    let mut map = SourceMapBuilder::new(None);
    let source_id = map.add_source(original_path.to_owned().into());
    map.set_source_contents(source_id, Some(original_source.to_owned().into()));
    append_unmapped(
        &mut source,
        &mut generated,
        &mut map,
        &format!(
            "import {{ registerModuleMock }} from {};\n",
            serde_json::to_string(runtime_request)?,
        ),
    );
    for declaration in declarations {
        let end = declaration
            .factory_start
            .checked_add(declaration.factory_source.len())
            .context("Mock factory source offset overflow")?;
        if original_source.get(declaration.factory_start..end) != Some(declaration.factory_source) {
            bail!("Mock factory source does not match its original source coordinates");
        }
        append_unmapped(
            &mut source,
            &mut generated,
            &mut map,
            &format!(
                "registerModuleMock({}, (",
                serde_json::to_string(declaration.key)?,
            ),
        );
        let mut original = SourcePosition::default();
        for character in original_source[..declaration.factory_start].chars() {
            original.advance(character);
        }
        for character in declaration.factory_source.chars() {
            if !matches!(character, '\r' | '\n') {
                for unit in 0..character.len_utf16() as u32 {
                    map.add_raw(
                        generated.line,
                        generated.column + unit,
                        original.line,
                        original.column + unit,
                        Some(source_id),
                        None,
                        false,
                    );
                }
            }
            source.push(character);
            generated.advance(character);
            original.advance(character);
        }
        append_unmapped(
            &mut source,
            &mut generated,
            &mut map,
            &format!(
                "), () => import({}));\n",
                serde_json::to_string(declaration.original_request)?,
            ),
        );
    }
    let mut encoded_map = Vec::new();
    map.into_sourcemap().to_writer(&mut encoded_map)?;
    source.push_str("//# sourceMappingURL=data:application/json;charset=utf-8;base64,");
    source.push_str(&BASE64.encode(&encoded_map));
    source.push('\n');
    Ok(source)
}

/// Match SWC source coordinates: CR/LF line breaks and UTF-16 columns. A CRLF
/// sequence is one line break. Other Unicode scalars contribute UTF-16 units.
#[derive(Default)]
struct SourcePosition {
    line: u32,
    column: u32,
    previous_cr: bool,
}
impl SourcePosition {
    fn advance(&mut self, character: char) {
        match character {
            '\r' => {
                self.line += 1;
                self.column = 0;
            }
            '\n' => {
                if !self.previous_cr {
                    self.line += 1;
                }
                self.column = 0;
            }
            _ => self.column += character.len_utf16() as u32,
        }
        self.previous_cr = character == '\r';
    }
}

fn append_unmapped(
    source: &mut String,
    position: &mut SourcePosition,
    map: &mut SourceMapBuilder,
    text: &str,
) {
    map.add_raw(position.line, position.column, 0, 0, None, None, false);
    for character in text.chars() {
        source.push(character);
        position.advance(character);
        if matches!(character, '\r' | '\n') {
            map.add_raw(position.line, position.column, 0, 0, None, None, false);
        }
    }
}

/// Keep the author's complete source content even though mock declarations
/// have been masked. The analyzer preserves UTF-16 positions in the spec.
pub(crate) fn mock_spec_source(
    original_path: &str,
    original_source: &str,
    stripped_source: &str,
) -> Result<String> {
    let widths = |source: &str| {
        source
            .split(['\r', '\n'])
            .map(|line| line.encode_utf16().count())
            .collect::<Vec<_>>()
    };
    if widths(original_source) != widths(stripped_source) {
        bail!("Stripped mock spec does not preserve original source coordinates");
    }
    let mut map = SourceMapBuilder::new(None);
    let source_id = map.add_source(original_path.to_owned().into());
    map.set_source_contents(source_id, Some(original_source.to_owned().into()));
    let mut position = SourcePosition::default();
    for character in stripped_source.chars() {
        if !matches!(character, '\r' | '\n') {
            for unit in 0..character.len_utf16() as u32 {
                map.add_raw(
                    position.line,
                    position.column + unit,
                    position.line,
                    position.column + unit,
                    Some(source_id),
                    None,
                    false,
                );
            }
        }
        position.advance(character);
    }
    let mut encoded_map = Vec::new();
    map.into_sourcemap().to_writer(&mut encoded_map)?;
    Ok(format!(
        "{stripped_source}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,{}\n",
        BASE64.encode(&encoded_map)
    ))
}

/// The selected export names are graph edges, not arbitrary factory keys.
/// For a complete object factory the analyzer supplies them; partial factories
/// additionally inherit statically known exports from the original target.
pub(crate) fn mock_wrapper_source(
    runtime_request: &str,
    key: &str,
    export_names: &[String],
) -> Result<String> {
    let mut source = format!(
        "import {{ resolveModuleMock }} from {};\nconst __next_mock_exports = await \
         resolveModuleMock({}, {});\n",
        serde_json::to_string(runtime_request)?,
        serde_json::to_string(key)?,
        serde_json::to_string(export_names)?,
    );
    for (index, name) in export_names.iter().enumerate() {
        let name = serde_json::to_string(name)?;
        source.push_str(&format!(
            "const __next_mock_export_{index} = __next_mock_exports[{name}];\nexport {{ \
             __next_mock_export_{index} as {name} }};\n",
        ));
    }
    Ok(source)
}

#[cfg(test)]
mod tests {
    use crate::testing_mock_graph::{
        MockRegistrationSource, mock_registration_source, mock_spec_source,
    };

    #[test]
    fn maps_unicode_columns_on_the_same_line() {
        let factory = "() => { const emoji = '😀'; throw new Error('boom') }";
        let prefix = "vi.mock('😀', ";
        let original = format!("{prefix}{factory});");
        let generated = mock_registration_source(
            "runtime",
            "turbopack:///unicode.js",
            &original,
            &[MockRegistrationSource {
                key: "dep",
                factory_source: factory,
                factory_start: prefix.len(),
                original_request: "original:dep",
            }],
        )
        .unwrap();
        let encoded = generated.split("base64,").last().unwrap().trim();
        let map = swc_sourcemap::SourceMap::from_slice(
            &data_encoding::BASE64.decode(encoded.as_bytes()).unwrap(),
        )
        .unwrap();
        let before = generated.split("new Error").next().unwrap();
        let column = before.rsplit('\n').next().unwrap().encode_utf16().count() as u32;
        let token = map.lookup_token(1, column).unwrap();
        let expected_column = original
            .split("new Error")
            .next()
            .unwrap()
            .encode_utf16()
            .count() as u32;
        assert_eq!(
            (token.get_src_line(), token.get_src_col()),
            (0, expected_column)
        );
    }

    #[test]
    fn keeps_full_author_source_for_masked_specs() {
        let original = "mock('😀');\nthrow new Error('after')";
        let stripped = "           \nthrow new Error('after')";
        let generated = mock_spec_source("turbopack:///spec.ts", original, stripped).unwrap();
        let encoded = generated.split("base64,").last().unwrap().trim();
        let map = swc_sourcemap::SourceMap::from_slice(
            &data_encoding::BASE64.decode(encoded.as_bytes()).unwrap(),
        )
        .unwrap();
        let token = map.lookup_token(1, 6).unwrap();
        assert_eq!((token.get_src_line(), token.get_src_col()), (1, 6));
        assert_eq!(
            map.get_source_contents(0).map(|value| value.as_str()),
            Some(original)
        );
        assert!(mock_spec_source("spec.ts", original, "short").is_err());
    }

    #[test]
    fn maps_moved_factories_to_original_utf16_coordinates() {
        let factory = "() => { const emoji = '😀';\r\n  throw new Error('boom')\r\n}";
        let original = format!(
            "import {{vi}} from 'vitest';\r\n// 😀 prefix\r\nvi.mock('./dep', {factory});\r\n"
        );
        let generated = mock_registration_source(
            "next/mock-runtime",
            "turbopack:///specs/error.ts",
            &original,
            &[MockRegistrationSource {
                key: "node:dep",
                factory_source: factory,
                factory_start: original.find(factory).unwrap(),
                original_request: "original:dep",
            }],
        )
        .unwrap();
        let encoded = generated.split("base64,").last().unwrap().trim();
        let map = swc_sourcemap::SourceMap::from_slice(
            &data_encoding::BASE64.decode(encoded.as_bytes()).unwrap(),
        )
        .unwrap();
        let before = generated.split("new Error").next().unwrap();
        let generated_line = before.bytes().filter(|byte| *byte == b'\n').count() as u32;
        let generated_column = before.rsplit('\n').next().unwrap().encode_utf16().count() as u32;
        let token = map.lookup_token(generated_line, generated_column).unwrap();
        assert_eq!((token.get_src_line(), token.get_src_col()), (3, 8));
        assert_eq!(
            token.get_source().map(|value| value.as_str()),
            Some("turbopack:///specs/error.ts")
        );
        assert_eq!(
            map.get_source_contents(0).map(|value| value.as_str()),
            Some(original.as_str())
        );
        // The generated registration prefix and lazy-import suffix have no
        // original location: they must not borrow the last factory token.
        assert!(map.lookup_token(1, 0).unwrap().get_source().is_none());
        let suffix = generated.split(", () => import").next().unwrap();
        let suffix_line = suffix.bytes().filter(|byte| *byte == b'\n').count() as u32;
        let suffix_col = suffix.rsplit('\n').next().unwrap().encode_utf16().count() as u32;
        assert!(
            map.lookup_token(suffix_line, suffix_col)
                .unwrap()
                .get_source()
                .is_none()
        );
    }

    #[test]
    fn rejects_mismatched_original_factory_coordinates() {
        assert!(
            mock_registration_source(
                "runtime",
                "spec.ts",
                "different",
                &[MockRegistrationSource {
                    key: "dep",
                    factory_source: "() => ({value: 1})",
                    factory_start: 0,
                    original_request: "original:dep",
                }]
            )
            .is_err()
        );
    }
}
