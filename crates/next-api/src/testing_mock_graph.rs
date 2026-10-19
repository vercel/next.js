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
    reference_type::{CommonJsReferenceSubType, EcmaScriptModulesReferenceSubType, ReferenceType},
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
    pub additional_original_requests: Vec<RcStr>,
    pub deferred_original_request: Option<RcStr>,
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
            Some(first.path.root().owned().await?),
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
            let deferred_original = original_request
                .as_ref()
                .is_some_and(|request| target.deferred_original_request.as_ref() == Some(request));
            if !matches!(
                reference_type,
                ReferenceType::EcmaScriptModules(
                    EcmaScriptModulesReferenceSubType::Import
                        | EcmaScriptModulesReferenceSubType::ImportPart(_)
                        | EcmaScriptModulesReferenceSubType::DynamicImport
                        | EcmaScriptModulesReferenceSubType::Undefined
                )
            ) && !(deferred_original
                && matches!(
                    reference_type,
                    ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined)
                ))
            {
                return Err(crate::testing::test_input_error(
                    fs_path.clone(),
                    "Module mock targets require normal ESM imports; CommonJS and import \
                     attributes are unsupported",
                ));
            }
            // ImportMap::Direct still passes through after-resolve plugins.
            // Bypass this one compiler-issued edge, not the original module's
            // context: ordinary imports from the original remain substituted.
            if deferred_original
                || original_request.as_ref() == Some(&target.original_request)
                || original_request
                    .as_ref()
                    .is_some_and(|request| target.additional_original_requests.contains(request))
            {
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
    pub original_factory_source: Option<&'a str>,
    pub factory_start: usize,
    pub original_request: &'a str,
    pub automatic: bool,
    pub spy: bool,
}

pub(crate) struct MockHoistedSource<'a> {
    pub source: &'a str,
    pub original_source: &'a str,
    pub start: usize,
    pub bindings: &'a [String],
}
pub(crate) struct MockActualSource<'a> {
    pub local: &'a str,
    pub original_request: &'a str,
}

#[derive(Clone, Copy)]
pub(crate) enum MockImportKind<'a> {
    Factory(&'a str),
    Automatic { spy: bool },
    BrowserAutomatic { spy: bool },
    Redirect,
}
pub(crate) struct MockImportSource<'a> {
    pub local: &'a str,
    pub original_request: &'a str,
    pub kind: MockImportKind<'a>,
}

/// Load this module before the stripped spec. Dynamic original imports must
/// remain deferred until a factory invokes its supplied importOriginal helper.
#[cfg(test)]
pub(crate) fn mock_registration_source(
    runtime_request: &str,
    original_path: &str,
    original_source: &str,
    declarations: &[MockRegistrationSource<'_>],
) -> Result<String> {
    mock_registration_source_with_helpers(
        runtime_request,
        original_path,
        original_source,
        declarations,
        &[],
        &[],
        &[],
        &[],
    )
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn mock_registration_source_with_helpers(
    runtime_request: &str,
    original_path: &str,
    original_source: &str,
    declarations: &[MockRegistrationSource<'_>],
    hoisted: &[MockHoistedSource<'_>],
    actual_imports: &[MockActualSource<'_>],
    mock_imports: &[MockImportSource<'_>],
    api_bindings: &[(String, String)],
) -> Result<String> {
    let mut source = String::new();
    let mut generated = SourcePosition::default();
    let mut map = SourceMapBuilder::new(None);
    let source_id = map.add_source(original_path.to_owned().into());
    map.set_source_contents(source_id, Some(original_source.to_owned().into()));
    if !declarations.is_empty() {
        append_unmapped(
            &mut source,
            &mut generated,
            &mut map,
            &format!(
                "import {{ registerModuleMock }} from {};\n",
                serde_json::to_string(runtime_request)?,
            ),
        );
    }
    let mut import_mock_api = "__next_import_mock".to_owned();
    while original_source.contains(&import_mock_api)
        || api_bindings
            .iter()
            .any(|(_, local)| local == &import_mock_api)
        || hoisted
            .iter()
            .any(|helper| helper.bindings.contains(&import_mock_api))
    {
        import_mock_api.push('_');
    }
    if !mock_imports.is_empty() {
        append_unmapped(
            &mut source,
            &mut generated,
            &mut map,
            &format!(
                "import {{ importModuleMock as {import_mock_api} }} from {};\n",
                serde_json::to_string(runtime_request)?
            ),
        );
    }
    let mut fresh_import_api = "__next_import_fresh_mock".to_owned();
    while original_source.contains(&fresh_import_api)
        || api_bindings
            .iter()
            .any(|(_, local)| local == &fresh_import_api)
        || hoisted
            .iter()
            .any(|helper| helper.bindings.contains(&fresh_import_api))
    {
        fresh_import_api.push('_');
    }
    if mock_imports
        .iter()
        .any(|import| matches!(import.kind, MockImportKind::BrowserAutomatic { .. }))
    {
        append_unmapped(
            &mut source,
            &mut generated,
            &mut map,
            &format!(
                "import {{ importFreshModuleMock as {fresh_import_api} }} from {};\n",
                serde_json::to_string(runtime_request)?
            ),
        );
    }
    let mut automatic_api = "__next_automatic_mock_api".to_owned();
    while original_source.contains(&automatic_api)
        || api_bindings
            .iter()
            .any(|(_, local)| local == &automatic_api)
        || hoisted
            .iter()
            .any(|helper| helper.bindings.contains(&automatic_api))
    {
        automatic_api.push('_');
    }
    if declarations.iter().any(|declaration| declaration.automatic)
        || mock_imports
            .iter()
            .any(|import| matches!(import.kind, MockImportKind::Automatic { .. }))
    {
        append_unmapped(
            &mut source,
            &mut generated,
            &mut map,
            &format!("import {{ vi as {automatic_api} }} from 'vitest';\n"),
        );
    }
    if !api_bindings.is_empty() {
        let names = api_bindings
            .iter()
            .map(|(imported, local)| format!("{imported} as {local}"))
            .collect::<Vec<_>>()
            .join(", ");
        append_unmapped(
            &mut source,
            &mut generated,
            &mut map,
            &format!("import {{ {names} }} from 'vitest';\n"),
        );
    }
    for import in actual_imports {
        append_unmapped(
            &mut source,
            &mut generated,
            &mut map,
            &format!(
                "export const {} = () => import({});\n",
                import.local,
                serde_json::to_string(import.original_request)?
            ),
        );
    }
    for (index, import) in mock_imports.iter().enumerate() {
        let mut browser_loader = format!("__next_browser_mock_original_{index}");
        if matches!(import.kind, MockImportKind::BrowserAutomatic { .. }) {
            while original_source.contains(&browser_loader)
                || api_bindings
                    .iter()
                    .any(|(_, local)| local == &browser_loader)
                || hoisted
                    .iter()
                    .any(|helper| helper.bindings.contains(&browser_loader))
            {
                browser_loader.push('_');
            }
            append_unmapped(
                &mut source,
                &mut generated,
                &mut map,
                &format!(
                    "import {browser_loader} from {} with {{ \"turbopack-transition\": {} }};\n",
                    serde_json::to_string(import.original_request)?,
                    serde_json::to_string(crate::testing_browser_mock_import::TRANSITION_NAME)?,
                ),
            );
        }
        let expression = match import.kind {
            MockImportKind::Factory(key) => {
                format!("{import_mock_api}({})", serde_json::to_string(key)?)
            }
            MockImportKind::Automatic { spy } => format!(
                "{import_mock_api}(() => import({}), (__next_original) => \
                 {}.mockObject(__next_original{}))",
                serde_json::to_string(import.original_request)?,
                automatic_api,
                if spy { ", { spy: true }" } else { "" }
            ),
            MockImportKind::BrowserAutomatic { spy } => {
                format!("{fresh_import_api}({browser_loader}, {{ spy: {spy} }})")
            }
            MockImportKind::Redirect => format!(
                "{import_mock_api}(() => import({}))",
                serde_json::to_string(import.original_request)?
            ),
        };
        append_unmapped(
            &mut source,
            &mut generated,
            &mut map,
            &format!(
                "export const {} = async () => {};\n",
                import.local, expression
            ),
        );
    }
    let mut events = declarations
        .iter()
        .enumerate()
        .map(|(index, declaration)| (declaration.factory_start, false, index))
        .chain(
            hoisted
                .iter()
                .enumerate()
                .map(|(index, declaration)| (declaration.start, true, index)),
        )
        .collect::<Vec<_>>();
    events.sort_by_key(|event| event.0);
    for (_, is_hoisted, index) in events {
        if is_hoisted {
            let declaration = &hoisted[index];
            append_mapped(
                &mut source,
                &mut generated,
                &mut map,
                source_id,
                original_source,
                declaration.start,
                declaration.original_source,
                declaration.source,
            )?;
            append_unmapped(&mut source, &mut generated, &mut map, "\n");
            if !declaration.bindings.is_empty() {
                append_unmapped(
                    &mut source,
                    &mut generated,
                    &mut map,
                    &format!("export {{ {} }};\n", declaration.bindings.join(", ")),
                );
            }
        } else {
            let declaration = &declarations[index];
            append_unmapped(
                &mut source,
                &mut generated,
                &mut map,
                &format!(
                    "registerModuleMock({}, (",
                    serde_json::to_string(declaration.key)?
                ),
            );
            if declaration.automatic {
                let options = if declaration.spy {
                    ", { spy: true }"
                } else {
                    ""
                };
                append_unmapped(
                    &mut source,
                    &mut generated,
                    &mut map,
                    &format!(
                        "async (__next_original) => {automatic_api}.mockObject(await \
                         __next_original(){options})"
                    ),
                );
            } else {
                append_mapped(
                    &mut source,
                    &mut generated,
                    &mut map,
                    source_id,
                    original_source,
                    declaration.factory_start,
                    declaration
                        .original_factory_source
                        .unwrap_or(declaration.factory_source),
                    declaration.factory_source,
                )?;
            }
            append_unmapped(
                &mut source,
                &mut generated,
                &mut map,
                &format!(
                    "), () => import({}));\n",
                    serde_json::to_string(declaration.original_request)?
                ),
            );
        }
    }
    let mut encoded_map = Vec::new();
    map.into_sourcemap().to_writer(&mut encoded_map)?;
    source.push_str("//# sourceMappingURL=data:application/json;charset=utf-8;base64,");
    source.push_str(&BASE64.encode(&encoded_map));
    source.push('\n');
    Ok(source)
}

#[allow(clippy::too_many_arguments)]
fn append_mapped(
    source: &mut String,
    generated: &mut SourcePosition,
    map: &mut SourceMapBuilder,
    source_id: u32,
    original_source: &str,
    start: usize,
    original_text: &str,
    transformed_text: &str,
) -> Result<()> {
    let end = start
        .checked_add(original_text.len())
        .context("Mock source offset overflow")?;
    if original_source.get(start..end) != Some(original_text) {
        bail!("Mock factory source does not match its original source coordinates");
    }
    let widths = |text: &str| {
        text.split(['\r', '\n'])
            .map(|line| line.encode_utf16().count())
            .collect::<Vec<_>>()
    };
    if widths(original_text) != widths(transformed_text) {
        bail!("Transformed mock source does not preserve original source coordinates");
    }
    let mut original = SourcePosition::default();
    for character in original_source[..start].chars() {
        original.advance(character);
    }
    for character in transformed_text.chars() {
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
    Ok(())
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
#[cfg(test)]
pub(crate) fn mock_spec_source(
    original_path: &str,
    original_source: &str,
    stripped_source: &str,
) -> Result<String> {
    mock_spec_source_with_imports(original_path, original_source, stripped_source, "", &[])
}

pub(crate) fn mock_spec_source_with_imports(
    original_path: &str,
    original_source: &str,
    stripped_source: &str,
    registration_request: &str,
    bindings: &[String],
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
    let mut transformed = stripped_source.to_owned();
    if !bindings.is_empty() {
        append_unmapped(
            &mut transformed,
            &mut position,
            &mut map,
            &format!(
                "\nimport {{ {} }} from {};\n",
                bindings.join(", "),
                serde_json::to_string(registration_request)?
            ),
        );
    }
    let mut encoded_map = Vec::new();
    map.into_sourcemap().to_writer(&mut encoded_map)?;
    Ok(format!(
        "{transformed}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,{}\n",
        BASE64.encode(&encoded_map)
    ))
}

/// The selected export names are graph edges, not arbitrary factory keys.
/// For a complete object factory the analyzer supplies them; partial factories
/// additionally inherit statically known exports from the original target.
#[cfg(test)]
pub(crate) fn mock_wrapper_source(
    runtime_request: &str,
    key: &str,
    original_request: &str,
    export_names: &[String],
    mocked_export_names: &[String],
) -> Result<String> {
    mock_wrapper_source_with_original_cycle(
        runtime_request,
        key,
        original_request,
        export_names,
        mocked_export_names,
        None,
    )
}

pub(crate) fn mock_wrapper_source_with_original_cycle(
    runtime_request: &str,
    key: &str,
    original_request: &str,
    export_names: &[String],
    mocked_export_names: &[String],
    cycle_members: Option<&[String]>,
) -> Result<String> {
    let mut original_edge = String::new();
    if let Some(members) = cycle_members {
        // Observe IDs without ordinary eager ESM evaluation dependencies. A
        // deferred shared require below retains the actual original factory.
        original_edge.push_str(&format!(
            "import {{ __turbopack_module_id__ as __next_original_id }} from {} with {{ \
             \"turbopack-chunking-type\":\"none\" }};\n",
            serde_json::to_string(original_request)?,
        ));
        for (index, request) in members.iter().enumerate() {
            original_edge.push_str(&format!(
                "import {{ __turbopack_module_id__ as __next_cycle_{index} }} from {} with {{ \
                 \"turbopack-chunking-type\":\"none\" }};\n",
                serde_json::to_string(request)?,
            ));
        }
    }
    let original_thunk = if let Some(members) = cycle_members {
        format!(
            ", () => Promise.resolve(__turbopack_context__.B(__next_original_id,[{}],() => \
             require(/*turbopackChunkingType: shared*/ {})))",
            (0..members.len())
                .map(|index| format!("__next_cycle_{index}"))
                .collect::<Vec<_>>()
                .join(","),
            serde_json::to_string(&format!("{original_request}:deferred"))?,
        )
    } else {
        String::new()
    };
    let mut source = format!(
        "{original_edge}import {{ resolveModuleMock }} from {};\nconst __next_mock_exports = \
         await resolveModuleMock({}, {}{original_thunk});\n",
        serde_json::to_string(runtime_request)?,
        serde_json::to_string(key)?,
        serde_json::to_string(export_names)?,
    );
    for (index, name) in export_names.iter().enumerate() {
        let is_mocked = mocked_export_names.contains(name);
        let name = serde_json::to_string(name)?;
        if is_mocked {
            source.push_str(&format!(
                "const __next_mock_export_{index} = __next_mock_exports[{name}];\nexport {{ \
                 __next_mock_export_{index} as {name} }};\n",
            ));
        } else {
            source.push_str(&format!(
                "import {{ {name} as __next_original_export_{index} }} from {};\nexport {{ \
                 __next_original_export_{index} as {name} }};\n",
                serde_json::to_string(original_request)?,
            ));
        }
    }
    Ok(source)
}

#[cfg(test)]
mod tests {
    use crate::testing_mock_graph::{
        MockRegistrationSource, mock_registration_source, mock_registration_source_with_helpers,
        mock_spec_source, mock_wrapper_source,
    };

    #[test]
    fn cyclic_original_uses_id_only_edges_and_the_native_owner_thunk() {
        let source = crate::testing_mock_graph::mock_wrapper_source_with_original_cycle(
            "runtime",
            "target",
            "original",
            &["value".into()],
            &["value".into()],
            Some(&["member".into()]),
        )
        .unwrap();
        assert!(source.contains("turbopackChunkingType: shared*/ \"original:deferred\""));
        assert!(source.contains("__turbopack_context__.B(__next_original_id,[__next_cycle_0],"));
        assert!(!source.contains("import(\"original\")"));
        assert!(!source.contains("from \"original\";"));
    }

    #[test]
    fn emits_mapped_helpers_before_factories_and_imports_their_shared_bindings() {
        use crate::{
            testing_mock_graph::{
                MockActualSource, MockHoistedSource, mock_registration_source_with_helpers,
                mock_spec_source_with_imports,
            },
            testing_mock_source::extract_static_mocks,
        };
        let original = "import{vi}from'vitest';const state=await \
                        vi.hoisted(async()=>({value:42}));vi.mock('./dep',async()=>({...await \
                        vi.importActual('./dep'),value:state.value}));";
        let plan = extract_static_mocks(original, "spec.mjs").unwrap();
        let declaration = &plan.declarations[0];
        let hoisted = &plan.hoisted[0];
        let actual = &plan.actual_imports[0];
        let registration = mock_registration_source_with_helpers(
            "runtime",
            "spec.mjs",
            original,
            &[MockRegistrationSource {
                key: "dep",
                factory_source: &declaration.factory_source,
                original_factory_source: Some(&declaration.original_factory_source),
                automatic: declaration.automatic,
                spy: declaration.spy,
                factory_start: declaration.factory_start,
                original_request: "original:dep",
            }],
            &[MockHoistedSource {
                source: &hoisted.source,
                original_source: &hoisted.original_source,
                start: hoisted.start,
                bindings: &hoisted.bindings,
            }],
            &[MockActualSource {
                local: &actual.local,
                original_request: "original:dep",
            }],
            &[],
            &plan.api_bindings,
        )
        .unwrap();
        assert!(registration.contains("import { vi as vi } from 'vitest'"));
        assert!(
            registration.find("export const _a0").unwrap()
                < registration.find("const state=").unwrap()
        );
        assert!(
            registration.find("const state=").unwrap()
                < registration.find("registerModuleMock(\"dep\"").unwrap()
        );
        assert!(registration.contains("export { state }"));
        let spec = mock_spec_source_with_imports(
            "spec.mjs",
            original,
            &plan.source,
            "registration",
            &["state".into(), actual.local.clone()],
        )
        .unwrap();
        assert!(spec.contains("import { state, _a0 } from \"registration\""));
        assert!(spec.contains("sourceMappingURL=data:"));
    }

    #[test]
    fn emits_automatic_factories_with_a_private_collision_free_api_binding() {
        let original = "import{vi}from'vitest';const __next_automatic_mock_api=1;vi.mock('./dep');";
        let generated = mock_registration_source(
            "next/mock-runtime",
            "spec.mjs",
            original,
            &[MockRegistrationSource {
                key: "dep",
                factory_source: "",
                original_factory_source: Some(""),
                factory_start: original.find("vi.mock").unwrap(),
                original_request: "original:dep",
                automatic: true,
                spy: false,
            }],
        )
        .unwrap();
        assert!(generated.contains("import { vi as __next_automatic_mock_api_ } from 'vitest'"));
        assert!(generated.contains(
            "async (__next_original) => __next_automatic_mock_api_.mockObject(await \
             __next_original())"
        ));
        assert!(generated.contains("() => import(\"original:dep\")"));
        assert!(!generated.contains("import *"));
    }

    #[test]
    fn emits_spy_factories_using_the_tracked_primitive_and_lazy_original_edge() {
        let original = "import{vi}from'vitest';vi.mock('./dep',{spy:true});";
        let generated = mock_registration_source(
            "next/mock-runtime",
            "spec.mjs",
            original,
            &[MockRegistrationSource {
                key: "dep",
                factory_source: "",
                original_factory_source: Some(""),
                factory_start: original.find("vi.mock").unwrap(),
                original_request: "original:dep",
                automatic: true,
                spy: true,
            }],
        )
        .unwrap();
        assert!(generated.contains(".mockObject(await __next_original(), { spy: true })"));
        assert!(generated.contains("() => import(\"original:dep\")"));
        assert!(!generated.contains("import *"));
    }

    #[test]
    fn imports_actual_api_aliases_for_factories_without_hoisted_helpers() {
        let factory = "() => ({value: tools.fn(() => 42)})";
        let original =
            format!("import {{vi as tools}} from 'vitest';tools.mock('./dep',{factory});");
        let generated = mock_registration_source_with_helpers(
            "next/mock-runtime",
            "spec.mjs",
            &original,
            &[MockRegistrationSource {
                key: "dep",
                factory_source: factory,
                original_factory_source: Some(factory),
                factory_start: original.find(factory).unwrap(),
                original_request: "original:dep",
                automatic: false,
                spy: false,
            }],
            &[],
            &[],
            &[],
            &[("vi".into(), "tools".into())],
        )
        .unwrap();
        assert!(generated.contains("import { vi as tools } from 'vitest';"));
        assert!(generated.contains(factory));
        assert_eq!(generated.matches("import { vi as tools }").count(), 1);
    }

    #[test]
    fn preserves_live_original_bindings_beside_fixed_mock_exports() {
        let generated = mock_wrapper_source(
            "next/mock-runtime",
            "node:dep",
            "original:dep",
            &["count".into(), "label".into()],
            &["label".into()],
        )
        .unwrap();
        assert!(
            generated
                .contains("import { \"count\" as __next_original_export_0 } from \"original:dep\"")
        );
        assert!(generated.contains("const __next_mock_export_1 = __next_mock_exports[\"label\"]"));
    }

    #[test]
    fn preserves_native_file_uri_for_spec_and_moved_factory_maps() {
        let identity = "file:///compiler/project/spec%20file.mjs";
        let factory = "() => ({value: 42})";
        let original = format!("vi.mock('./dep', {factory});");
        let registration = mock_registration_source(
            "runtime",
            identity,
            &original,
            &[MockRegistrationSource {
                key: "dep",
                factory_source: factory,
                original_factory_source: None,
                automatic: false,
                spy: false,
                factory_start: "vi.mock('./dep', ".len(),
                original_request: "original:dep",
            }],
        )
        .unwrap();
        let spec = mock_spec_source(identity, &original, &" ".repeat(original.len())).unwrap();
        for generated in [registration, spec] {
            let encoded = generated.split("base64,").last().unwrap().trim();
            let map = swc_sourcemap::SourceMap::from_slice(
                &data_encoding::BASE64.decode(encoded.as_bytes()).unwrap(),
            )
            .unwrap();
            assert_eq!(
                map.get_source(0).map(|value| value.as_str()),
                Some(identity)
            );
            assert_eq!(
                map.get_source_contents(0).map(|value| value.as_str()),
                Some(original.as_str())
            );
            assert!(map.get_source_root().is_none());
        }
    }

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
                original_factory_source: None,
                automatic: false,
                spy: false,
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
                original_factory_source: None,
                automatic: false,
                spy: false,
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
                    original_factory_source: None,
                    automatic: false,
                    spy: false,
                    factory_start: 0,
                    original_request: "original:dep",
                }]
            )
            .is_err()
        );
    }
}

#[cfg(test)]
mod import_mock_helper_tests {
    use super::*;

    #[test]
    fn emits_distinct_factory_redirect_and_fresh_automatic_selections() {
        let generated = mock_registration_source_with_helpers(
            "runtime",
            "entry.mjs",
            "import{vi}from'vitest'",
            &[],
            &[],
            &[],
            &[
                MockImportSource {
                    local: "_m0",
                    original_request: "original:factory",
                    kind: MockImportKind::Factory("resolved:factory"),
                },
                MockImportSource {
                    local: "_m1",
                    original_request: "manual:redirect",
                    kind: MockImportKind::Redirect,
                },
                MockImportSource {
                    local: "_m2",
                    original_request: "original:auto",
                    kind: MockImportKind::Automatic { spy: false },
                },
                MockImportSource {
                    local: "_m3",
                    original_request: "original:spy",
                    kind: MockImportKind::Automatic { spy: true },
                },
            ],
            &[],
        )
        .unwrap();
        assert!(
            generated
                .contains("import { importModuleMock as __next_import_mock } from \"runtime\";")
        );
        assert!(
            generated.contains(
                "export const _m0 = async () => __next_import_mock(\"resolved:factory\");"
            )
        );
        assert!(generated.contains(
            "export const _m1 = async () => __next_import_mock(() => import(\"manual:redirect\"));"
        ));
        assert!(generated.contains(
            "__next_import_mock(() => import(\"original:auto\"), (__next_original) => \
             __next_automatic_mock_api.mockObject(__next_original))"
        ));
        assert!(generated.contains("mockObject(__next_original, { spy: true })"));
        assert!(!generated.contains("registerModuleMock(\"resolved:factory\""));
    }
    #[test]
    fn keeps_authored_api_and_hoisted_names_distinct_from_the_runtime_helper() {
        let original = "import{vi as importModuleMock}from'vitest';const \
                        __next_import_mock=1;importModuleMock.importMock('./dep')";
        let generated = mock_registration_source_with_helpers(
            "runtime",
            "entry.mjs",
            original,
            &[],
            &[],
            &[],
            &[MockImportSource {
                local: "_m0",
                original_request: "actual:dep",
                kind: MockImportKind::Automatic { spy: false },
            }],
            &[("vi".into(), "importModuleMock".into())],
        )
        .unwrap();
        assert!(
            generated
                .contains("import { importModuleMock as __next_import_mock_ } from \"runtime\";")
        );
        assert!(generated.contains("import { vi as importModuleMock } from 'vitest';"));
        assert!(generated.contains("export const _m0 = async () => __next_import_mock_("));
    }
    #[test]
    fn excludes_normalized_escaped_api_names_from_the_runtime_helper() {
        let generated = mock_registration_source_with_helpers(
            "runtime",
            "entry.mjs",
            r"import{vi as \u005f_next_import_mock}from'vitest'",
            &[],
            &[],
            &[],
            &[MockImportSource {
                local: "_m0",
                original_request: "actual:dep",
                kind: MockImportKind::Redirect,
            }],
            &[("vi".into(), "__next_import_mock".into())],
        )
        .unwrap();
        assert!(
            generated
                .contains(r#"import { importModuleMock as __next_import_mock_ } from "runtime";"#)
        );
        assert!(generated.contains("import { vi as __next_import_mock } from 'vitest';"));
    }
    #[test]
    fn omits_an_unused_register_import_for_import_mock_only_aliases() {
        let generated = mock_registration_source_with_helpers(
            "runtime",
            "entry.mjs",
            "import{vi as registerModuleMock}from'vitest';registerModuleMock.importMock('./dep')",
            &[],
            &[],
            &[],
            &[MockImportSource {
                local: "_m0",
                original_request: "actual:dep",
                kind: MockImportKind::Automatic { spy: false },
            }],
            &[("vi".into(), "registerModuleMock".into())],
        )
        .unwrap();
        assert!(generated.contains("import { vi as registerModuleMock } from 'vitest';"));
        assert!(!generated.contains("import { registerModuleMock } from"));
    }
}

#[cfg(test)]
mod browser_import_mock_helper_tests {
    use swc_core::{
        common::{FileName, SourceMap},
        ecma::{
            ast::EsVersion,
            parser::{Syntax, parse_file_as_program},
        },
    };

    use crate::testing_mock_graph::{
        MockImportKind, MockImportSource, mock_registration_source_with_helpers,
    };

    fn assert_parses(source: &str) {
        let map = SourceMap::default();
        let file = map.new_source_file(
            FileName::Custom("browser-import-mock.mjs".into()).into(),
            source.to_string(),
        );
        let mut errors = Vec::new();
        parse_file_as_program(
            &file,
            Syntax::Es(Default::default()),
            EsVersion::EsNext,
            None,
            &mut errors,
        )
        .unwrap();
        assert!(errors.is_empty(), "{errors:?}");
    }

    #[test]
    fn browser_automatic_helpers_use_direct_native_adapter_values() {
        let generated = mock_registration_source_with_helpers(
            "runtime",
            "entry.mjs",
            "import {vi} from 'vitest'",
            &[],
            &[],
            &[],
            &[
                MockImportSource {
                    local: "_m0",
                    original_request: "fresh:shared",
                    kind: MockImportKind::BrowserAutomatic { spy: false },
                },
                MockImportSource {
                    local: "_m1",
                    original_request: "fresh:shared",
                    kind: MockImportKind::BrowserAutomatic { spy: true },
                },
            ],
            &[],
        )
        .unwrap();
        assert_parses(&generated);
        assert_eq!(generated.matches("from \"fresh:shared\" with").count(), 2);
        assert_eq!(
            generated
                .matches("\"turbopack-transition\": \"next-test-browser-import-mock\"")
                .count(),
            2
        );
        assert!(
            generated.contains(
                "__next_import_fresh_mock(__next_browser_mock_original_0, { spy: false })"
            )
        );
        assert!(
            generated.contains(
                "__next_import_fresh_mock(__next_browser_mock_original_1, { spy: true })"
            )
        );
        assert!(!generated.contains("import(\"fresh:shared\")"));
        assert!(!generated.contains(".mockObject("));
    }

    #[test]
    fn browser_helper_imports_keep_authored_names_and_node_selections_distinct() {
        let original = "const __next_import_fresh_mock=0;const __next_browser_mock_original_0=0;";
        let generated = mock_registration_source_with_helpers(
            "runtime",
            "entry.mjs",
            original,
            &[],
            &[],
            &[],
            &[
                MockImportSource {
                    local: "_m0",
                    original_request: "fresh:target",
                    kind: MockImportKind::BrowserAutomatic { spy: false },
                },
                MockImportSource {
                    local: "_m1",
                    original_request: "cached:target",
                    kind: MockImportKind::Automatic { spy: false },
                },
                MockImportSource {
                    local: "_m2",
                    original_request: "manual:target",
                    kind: MockImportKind::Redirect,
                },
            ],
            &[("vi".into(), "__next_import_fresh_mock_".into())],
        )
        .unwrap();
        assert_parses(&generated);
        assert!(generated.contains("importFreshModuleMock as __next_import_fresh_mock__"));
        assert!(generated.contains("import __next_browser_mock_original_0_ from \"fresh:target\""));
        assert!(generated.contains(
            "__next_import_fresh_mock__(__next_browser_mock_original_0_, { spy: false })"
        ));
        assert!(generated.contains(
            "__next_import_mock(() => import(\"cached:target\"), (__next_original) => \
             __next_automatic_mock_api.mockObject(__next_original))"
        ));
        assert!(generated.contains("__next_import_mock(() => import(\"manual:target\"))"));
    }
}
