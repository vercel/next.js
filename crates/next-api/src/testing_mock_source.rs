//! Spec-only static factory extraction. Resolution and graph substitution belong
//! to the caller; this module never resolves a JavaScript request itself.

use std::collections::{HashMap, HashSet};

use anyhow::{Result, bail};
use swc_core::{
    common::{FileName, GLOBALS, Mark, SourceMap, Span, Spanned, SyntaxContext},
    ecma::{
        ast::*,
        parser::{Syntax, TsSyntax, parse_file_as_program},
        transforms::base::resolver,
        visit::{Visit, VisitWith},
    },
};

pub(crate) struct StaticMockPlan {
    pub source: String,
    pub declarations: Vec<StaticMockDeclaration>,
    pub hoisted: Vec<HoistedDeclaration>,
    pub actual_imports: Vec<StaticActualImport>,
    pub mock_imports: Vec<StaticActualImport>,
    pub unmocks: Vec<StaticUnmockDeclaration>,
    pub api_bindings: Vec<(String, String)>,
    pub reset_modules: bool,
    pub runtime_requests: Vec<String>,
    /// Inline terminal-throw forms still require a resolved native or compiled leaf-ESM
    /// certificate.
    pub throw_only_runtime_requests: Vec<String>,
}
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct NativeUnmockTarget {
    pub request: String,
    pub retained: bool,
    pub surviving_factories: usize,
}

/// Callers supply actual resolved identities; distinct spellings cannot share one.
pub(crate) fn native_unmock_original_is_available<K: Eq + std::hash::Hash>(
    known: &HashMap<K, NativeUnmockTarget>,
    original: &K,
    request: &str,
) -> bool {
    known.iter().all(|(previous, target)| {
        if previous == original {
            target.request == request
        } else {
            target.request != request
        }
    })
}

impl StaticMockPlan {
    /// Syntax only; assembly must retain the actual local CommonJS leaf owner.
    pub(crate) fn commonjs_original_reset_candidate(&self) -> bool {
        let [factory] = self.declarations.as_slice() else {
            return false;
        };
        self.reset_modules
            && self.hoisted.is_empty()
            && self.actual_imports.is_empty()
            && self.mock_imports.is_empty()
            && self.unmocks.is_empty()
            && self.runtime_requests.is_empty()
            && (factory.request.starts_with("./") || factory.request.starts_with("../"))
            && !factory.request.contains(['?', '#', '\\'])
            && !factory.automatic
            && !factory.spy
            && !factory.has_parameters
            && factory.has_object_return
            && !factory.has_spread
            && !factory.has_reset_factory_escape
    }

    /// Syntax groups only. Native resolution/certificates remain assembly-owned.
    pub(crate) fn native_unmock_targets(&self) -> Option<Vec<NativeUnmockTarget>> {
        if self.declarations.is_empty()
            || self.unmocks.is_empty()
            || !self.reset_modules
            || !self.hoisted.is_empty()
            || !self.mock_imports.is_empty()
        {
            return None;
        }
        let ranges = self
            .declarations
            .iter()
            .map(|factory| {
                factory
                    .factory_start
                    .checked_add(factory.original_factory_source.len())
                    .map(|end| (factory.factory_start, end))
            })
            .collect::<Option<Vec<_>>>()?;
        let mut requests = Vec::new();
        for factory in &self.declarations {
            let request = factory.request.as_str();
            if request.is_empty()
                || request.starts_with(['.', '/', '#', '\\'])
                || request.contains(['?', '#', ':'])
                || factory.automatic
                || factory.spy
                || !factory.has_object_return
                || factory.has_spread
                || factory.original_factory_source.is_empty()
            {
                return None;
            }
            if !requests.contains(&request) {
                requests.push(request);
            }
        }
        // New multi-target combinations are bare package roots only. Aliased
        // subpath equivalence needs its own resolved/runtime conformance model.
        if requests.len() > 1
            && requests.iter().any(|request| {
                if request.starts_with('@') {
                    let parts = request.split('/').collect::<Vec<_>>();
                    parts.len() != 2 || parts[0].len() <= 1 || parts[1].is_empty()
                } else {
                    request.contains('/')
                }
            })
        {
            return None;
        }
        if ranges.windows(2).any(|pair| pair[0].1 > pair[1].0)
            || self
                .unmocks
                .windows(2)
                .any(|pair| pair[0].end > pair[1].start)
            || self.unmocks.iter().any(|cut| {
                !requests.contains(&cut.request.as_str())
                    || cut.start >= cut.end
                    || ranges
                        .iter()
                        .any(|&(start, end)| cut.start < end && cut.end > start)
            })
            || self.runtime_requests.len() != requests.len()
            || self.runtime_requests.iter().collect::<HashSet<_>>().len() != requests.len()
            || self
                .runtime_requests
                .iter()
                .any(|request| !requests.contains(&request.as_str()))
            || self
                .actual_imports
                .iter()
                .any(|actual| !requests.contains(&actual.request.as_str()))
        {
            return None;
        }
        requests
            .into_iter()
            .map(|request| {
                let cut = self
                    .unmocks
                    .iter()
                    .filter(|cut| cut.request == request)
                    .last()?;
                let factory = self
                    .declarations
                    .iter()
                    .filter(|factory| factory.request == request)
                    .last()?;
                let end = factory
                    .factory_start
                    .checked_add(factory.original_factory_source.len())?;
                let retained = cut.end <= factory.factory_start;
                if (!retained && cut.start < end)
                    || !self
                        .actual_imports
                        .iter()
                        .any(|actual| actual.request == request)
                {
                    return None;
                }
                Some(NativeUnmockTarget {
                    request: request.to_owned(),
                    retained,
                    surviving_factories: self
                        .declarations
                        .iter()
                        .filter(|factory| {
                            factory.request == request && factory.factory_start >= cut.end
                        })
                        .count(),
                })
            })
            .collect()
    }
    // Syntax candidates only. Assembly proves the actual cancelled/surviving
    // declaration, canonical original, helper owner and native provider.
    #[cfg(test)]
    pub(crate) fn retained_single_native_unmock(&self) -> Option<&str> {
        self.single_native_unmock(true)
    }

    #[cfg(test)]
    pub(crate) fn cancelled_single_native_unmock(&self) -> Option<&str> {
        self.single_native_unmock(false)
    }

    #[cfg(test)]
    fn single_native_unmock(&self, retained: bool) -> Option<&str> {
        let unmock = self.unmocks.last()?;
        let declaration = self.declarations.last()?;
        let [runtime] = self.runtime_requests.as_slice() else {
            return None;
        };
        let request = declaration.request.as_str();
        let factory_ranges = self
            .declarations
            .iter()
            .map(|factory| {
                factory
                    .factory_start
                    .checked_add(factory.original_factory_source.len())
                    .map(|end| (factory.factory_start, end))
            })
            .collect::<Option<Vec<_>>>()?;
        let factory_end = factory_ranges.last()?.1;
        if request.is_empty()
            || request.starts_with(['.', '/', '#', '\\'])
            || request.contains(['?', '#', ':'])
            || self.unmocks.iter().any(|cut| {
                cut.request != request
                    || cut.start >= cut.end
                    || factory_ranges
                        .iter()
                        .any(|&(start, end)| cut.start < end && cut.end > start)
            })
            || self
                .unmocks
                .windows(2)
                .any(|cuts| cuts[0].end > cuts[1].start)
            || if retained {
                unmock.end > declaration.factory_start
            } else {
                unmock.start < factory_end
            }
            || runtime != request
            || !self.reset_modules
            || self.actual_imports.is_empty()
            || self
                .actual_imports
                .iter()
                .any(|actual| actual.request != request)
            || !self.hoisted.is_empty()
            || !self.mock_imports.is_empty()
            || self.declarations.iter().any(|factory| {
                factory.request != request
                    || factory.automatic
                    || factory.spy
                    || !factory.has_object_return
                    || factory.has_spread
                    || factory.original_factory_source.is_empty()
            })
            || factory_ranges
                .windows(2)
                .any(|ranges| ranges[0].1 > ranges[1].0)
        {
            return None;
        }
        Some(request)
    }

    pub fn is_empty(&self) -> bool {
        self.declarations.is_empty()
            && self.hoisted.is_empty()
            && self.actual_imports.is_empty()
            && self.mock_imports.is_empty()
            && self.unmocks.is_empty()
            && !self.reset_modules
            && self.runtime_requests.is_empty()
    }
}

pub(crate) struct HoistedDeclaration {
    pub source: String,
    pub original_source: String,
    pub start: usize,
    pub bindings: Vec<String>,
    pub has_dynamic_import: bool,
}

pub(crate) struct StaticActualImport {
    pub request: String,
    pub local: String,
}

pub(crate) struct StaticUnmockDeclaration {
    pub request: String,
    pub start: usize,
    pub end: usize,
}

struct SourceEdit {
    start: usize,
    end: usize,
    replacement: String,
}

pub(crate) struct StaticMockDeclaration {
    pub request: String,
    pub factory_source: String,
    pub original_factory_source: String,
    pub factory_start: usize,
    pub export_names: Vec<String>,
    pub has_spread: bool,
    pub has_object_return: bool,
    pub has_parameters: bool,
    pub has_reset_factory_escape: bool,
    pub automatic: bool,
    pub spy: bool,
}

pub(crate) fn extract_static_mocks(source: &str, filename: &str) -> Result<StaticMockPlan> {
    GLOBALS.set(&Default::default(), || extract(source, filename, false))
}

/// Explicit test entries can retain runtime calls and their lexical factories.
/// The static-only extractor above keeps its existing hoisted-plan contract.
pub(crate) fn extract_test_mocks(source: &str, filename: &str) -> Result<StaticMockPlan> {
    GLOBALS.set(&Default::default(), || extract(source, filename, true))
}

fn parse_source(source: &str, filename: &str) -> Result<(Program, u32)> {
    let cm = SourceMap::default();
    let file = cm.new_source_file(FileName::Custom(filename.into()).into(), source.to_owned());
    let mut errors = Vec::new();
    let program = parse_file_as_program(
        &file,
        Syntax::Typescript(TsSyntax {
            tsx: ![".ts", ".mts", ".cts"]
                .iter()
                .any(|extension| filename.ends_with(extension)),
            decorators: true,
            ..Default::default()
        }),
        EsVersion::EsNext,
        None,
        &mut errors,
    )
    .map_err(|error| {
        anyhow::anyhow!("Cannot analyze static module mocks in {filename}: {error:?}")
    })?;
    if !errors.is_empty() {
        bail!(
            "Cannot analyze static module mocks in {filename}: {:?}",
            errors[0]
        );
    }
    Ok((program, file.start_pos.0))
}

/// Source registration order for a certified public ESM namespace. The caller
/// must separately match this complete table to the actual compiler module.
enum RuntimeNamespaceExports {
    Supported(Vec<String>),
    Unsupported(&'static str),
}

pub(crate) fn runtime_namespace_exports(source: &str, filename: &str) -> Result<Vec<String>> {
    match parsed_runtime_namespace_exports(source, filename)? {
        RuntimeNamespaceExports::Supported(names) => Ok(names),
        RuntimeNamespaceExports::Unsupported(reason) => bail!(reason),
    }
}

/// Candidate data alone does not certify a compiler module or its export set.
pub(crate) fn runtime_namespace_exports_candidate(
    source: &str,
    filename: &str,
) -> Result<Option<Vec<String>>> {
    match parsed_runtime_namespace_exports(source, filename)? {
        RuntimeNamespaceExports::Supported(names) => Ok(Some(names)),
        RuntimeNamespaceExports::Unsupported(_) => Ok(None),
    }
}

fn parsed_runtime_namespace_exports(
    source: &str,
    filename: &str,
) -> Result<RuntimeNamespaceExports> {
    GLOBALS.set(&Default::default(), || {
        let (program, _) = parse_source(source, filename)?;
        let Program::Module(module) = program else {
            return Ok(RuntimeNamespaceExports::Unsupported(
                "Runtime namespace construction requires an actual ESM source",
            ));
        };
        let mut names = Vec::new();
        let export_name = |name: &ModuleExportName| match name {
            ModuleExportName::Ident(ident) => ident.sym.to_string(),
            ModuleExportName::Str(value) => value.value.to_string_lossy().into_owned(),
        };
        for item in module.body {
            let ModuleItem::ModuleDecl(declaration) = item else {
                continue;
            };
            match declaration {
                ModuleDecl::ExportDecl(export) => match export.decl {
                    Decl::Fn(function) => names.push(function.ident.sym.to_string()),
                    Decl::Class(class) => names.push(class.ident.sym.to_string()),
                    Decl::Var(declaration) => {
                        for binding in declaration.decls {
                            let Pat::Ident(ident) = binding.name else {
                                return Ok(RuntimeNamespaceExports::Unsupported(
                                    "Runtime namespace destructured exports are not qualified",
                                ));
                            };
                            names.push(ident.id.sym.to_string());
                        }
                    }
                    Decl::TsInterface(_) | Decl::TsTypeAlias(_) => {}
                    _ => {
                        return Ok(RuntimeNamespaceExports::Unsupported(
                            "Runtime namespace declaration form is not qualified",
                        ));
                    }
                },
                ModuleDecl::ExportNamed(export) => {
                    if export.type_only {
                        continue;
                    }
                    for specifier in export.specifiers {
                        match specifier {
                            ExportSpecifier::Named(named) if !named.is_type_only => {
                                names.push(export_name(
                                    named.exported.as_ref().unwrap_or(&named.orig),
                                ));
                            }
                            ExportSpecifier::Named(_) => {}
                            ExportSpecifier::Namespace(namespace) => {
                                names.push(export_name(&namespace.name))
                            }
                            ExportSpecifier::Default(_) => {
                                return Ok(RuntimeNamespaceExports::Unsupported(
                                    "Runtime namespace default forwarding is not qualified",
                                ));
                            }
                        }
                    }
                }
                ModuleDecl::ExportDefaultDecl(export) => match export.decl {
                    DefaultDecl::TsInterfaceDecl(_) => {}
                    _ => names.push("default".into()),
                },
                ModuleDecl::ExportDefaultExpr(_) => names.push("default".into()),
                ModuleDecl::ExportAll(_) => {
                    return Ok(RuntimeNamespaceExports::Unsupported(
                        "Runtime namespace star exports are not qualified",
                    ));
                }
                ModuleDecl::Import(_) => {}
                _ => {
                    return Ok(RuntimeNamespaceExports::Unsupported(
                        "Runtime namespace module form is not qualified",
                    ));
                }
            }
        }
        if names.iter().collect::<HashSet<_>>().len() != names.len() {
            return Ok(RuntimeNamespaceExports::Unsupported(
                "Runtime namespace export order must be unique",
            ));
        }
        Ok(RuntimeNamespaceExports::Supported(names))
    })
}

/// Validate directive prologues with the parser, including leading comments.
/// Node factory replacements must never erase a Client/Server reference boundary.
pub(crate) fn validate_mock_target_source(source: &str, filename: &str) -> Result<()> {
    GLOBALS.set(&Default::default(), || {
        let (program, _) = parse_source(source, filename)?;
        let statements: Vec<&Stmt> = match &program {
            Program::Module(module) => module
                .body
                .iter()
                .take_while(|item| matches!(item, ModuleItem::Stmt(_)))
                .filter_map(|item| match item {
                    ModuleItem::Stmt(stmt) => Some(stmt),
                    _ => None,
                })
                .collect(),
            Program::Script(script) => script.body.iter().collect(),
        };
        for statement in statements {
            let Stmt::Expr(statement) = statement else {
                break;
            };
            let Expr::Lit(Lit::Str(directive)) = &*statement.expr else {
                break;
            };
            if matches!(directive.value.as_str(), Some("use client" | "use server")) {
                bail!(
                    "Node module mocks cannot replace use client/use server targets ({filename})."
                );
            }
        }
        Ok(())
    })
}

/// This bounded spy profile has only direct static ESM consumers. Inspect the
/// original syntax too, so dead branches and opaque CommonJS loader spellings
/// cannot disappear before the native consumer certificate is checked.
pub(crate) fn validate_cjs_spy_entry_source(source: &str, filename: &str) -> Result<()> {
    GLOBALS.set(&Default::default(), || {
        let (program, _) = parse_source(source, filename)?;
        let mut syntax = CjsSpyLoaderSyntax::default();
        program.visit_with(&mut syntax);
        if syntax.0 {
            bail!(
                "CommonJS spies require direct static ESM consumers without CommonJS or \
                 reflective loaders ({filename})."
            );
        }
        Ok(())
    })
}

#[derive(Default)]
struct CjsSpyLoaderSyntax(bool);
impl Visit for CjsSpyLoaderSyntax {
    fn visit_expr(&mut self, expression: &Expr) {
        if matches!(expression, Expr::Ident(name) if matches!(name.sym.as_ref(), "require" | "module" | "eval" | "Function"))
        {
            self.0 = true;
        }
        expression.visit_children_with(self);
    }
    fn visit_import_decl(&mut self, import: &ImportDecl) {
        if matches!(import.src.value.as_str(), Some("node:module" | "module")) {
            self.0 = true;
        }
        import.visit_children_with(self);
    }
    fn visit_call_expr(&mut self, call: &CallExpr) {
        if matches!(call.callee, Callee::Import(_)) {
            self.0 = true;
        }
        call.visit_children_with(self);
    }
    fn visit_member_expr(&mut self, member: &MemberExpr) {
        let loader = |name: &str| {
            matches!(
                name,
                "require" | "createRequire" | "getBuiltinModule" | "eval" | "Function"
            )
        };
        if match &member.prop {
            MemberProp::Ident(name) => loader(&name.sym),
            MemberProp::Computed(property) => {
                matches!(&*property.expr, Expr::Lit(Lit::Str(name)) if name.value.as_str().is_some_and(loader))
            }
            MemberProp::PrivateName(_) => false,
        } {
            self.0 = true;
        }
        member.visit_children_with(self);
    }
}

/// Manual redirects use their original ESM source, without spec-only transforms.
pub(crate) fn validate_manual_mock_source(source: &str, filename: &str) -> Result<()> {
    validate_mock_target_source(source, filename)?;
    if !extract_static_mocks(source, filename)?.is_empty() {
        bail!(
            "Compiler-owned vi.mock/vi.hoisted/vi.importActual helpers inside manual mock files \
             are not implemented; keep those declarations in the spec ({filename})."
        );
    }
    Ok(())
}

#[derive(Default)]
struct DynamicImports(bool);
impl Visit for DynamicImports {
    fn visit_call_expr(&mut self, call: &CallExpr) {
        self.0 |= matches!(call.callee, Callee::Import(_));
        call.visit_children_with(self);
    }
}

#[derive(Default)]
struct RuntimeImportShape(bool);
impl Visit for RuntimeImportShape {
    fn visit_call_expr(&mut self, call: &CallExpr) {
        if matches!(call.callee, Callee::Import(_)) {
            self.0 |= call.args.len() != 1
                || call.args.iter().any(|argument| argument.spread.is_some())
                || !matches!(
                    call.args.first().map(|argument| &*argument.expr),
                    Some(Expr::Lit(Lit::Str(_)))
                );
        }
        call.visit_children_with(self);
    }
}

// This is only syntax admission for the native producer. Every candidate must
// still resolve to the exact certified external module before code is emitted.
fn native_static_request(call: &CallExpr) -> Option<&str> {
    let argument = call.args.first()?;
    if argument.spread.is_some() {
        return None;
    }
    let Expr::Lit(Lit::Str(request)) = &*argument.expr else {
        return None;
    };
    let request = request.value.as_str()?;
    (!request.is_empty()
        && !request.starts_with(['.', '/', '#', '\\'])
        && !request.contains('?')
        && !request.contains('#')
        && (!request.contains(':') || request.starts_with("node:")))
    .then_some(request)
}

fn extract(source: &str, filename: &str, allow_runtime: bool) -> Result<StaticMockPlan> {
    let (mut program, start_pos) = parse_source(source, filename)?;
    let unresolved = Mark::new();
    program.mutate(resolver(unresolved, Mark::new(), true));
    let unresolved = SyntaxContext::empty().apply_mark(unresolved);
    let Program::Module(module) = &program else {
        return Ok(StaticMockPlan {
            source: source.into(),
            declarations: Vec::new(),
            hoisted: Vec::new(),
            actual_imports: Vec::new(),
            mock_imports: Vec::new(),
            unmocks: Vec::new(),
            api_bindings: Vec::new(),
            reset_modules: false,
            runtime_requests: Vec::new(),
            throw_only_runtime_requests: Vec::new(),
        });
    };
    let mut bindings = HashSet::new();
    let mut identity_observers = HashSet::new();
    let mut api_bindings = Vec::new();
    for item in &module.body {
        if let ModuleItem::ModuleDecl(ModuleDecl::Import(import)) = item {
            if !matches!(
                import.src.value.as_str(),
                Some("vitest" | "next/experimental/testing/vitest")
            ) {
                continue;
            }
            for specifier in &import.specifiers {
                if let ImportSpecifier::Named(named) = specifier {
                    let imported = named
                        .imported
                        .as_ref()
                        .map(|name| name.atom().to_string())
                        .unwrap_or_else(|| named.local.sym.to_string());
                    if imported == "expect" && !import.type_only && !named.is_type_only {
                        identity_observers.insert(named.local.to_id());
                    }
                    if matches!(imported.as_str(), "vi" | "vitest")
                        && !import.type_only
                        && !named.is_type_only
                    {
                        bindings.insert(named.local.to_id());
                        api_bindings.push((imported, named.local.sym.to_string()));
                    }
                }
            }
        }
    }
    let mut aliases = ApiAliases {
        bindings: &bindings,
        aliases: HashSet::new(),
    };
    module.visit_with(&mut aliases);
    let mut calls = MockCalls {
        bindings: &bindings,
        alias_bindings: &aliases.aliases,
        identity_observers: &identity_observers,
        identity_observation: false,
        strict_identity_observation: false,
        calls: Vec::new(),
        hoisted_calls: Vec::new(),
        actual_calls: Vec::new(),
        mock_import_calls: Vec::new(),
        unmock_calls: Vec::new(),
        reset_calls: Vec::new(),
        reset_method_reference: false,
        runtime_calls: Vec::new(),
        allow_runtime,
        invalid: false,
        value_alias: false,
    };
    module.visit_with(&mut calls);
    let reset_required = !calls.reset_calls.is_empty() || calls.reset_method_reference;
    if (calls.identity_observation || calls.strict_identity_observation)
        && calls.runtime_calls.is_empty()
        && !reset_required
    {
        // Keep ordinary files and the existing static-only admission unchanged.
        // Without a reset/runtime call, this is still a generic API value read.
        calls.value_alias = true;
    } else if calls.identity_observation {
        // Only a direct imported builtin matcher may observe the API value.
        // An escaped or extended observer could turn that read into an alias.
        let mut observer_uses = IdentityObserverUses {
            bindings: &identity_observers,
            invalid: false,
        };
        module.visit_with(&mut observer_uses);
        if observer_uses.invalid {
            bail!(
                "Runtime API identity observations require an unmodified direct imported expect \
                 ({filename})."
            );
        }
    }
    if calls.invalid
        || (calls.value_alias
            && (!calls.calls.is_empty()
                || !calls.hoisted_calls.is_empty()
                || !calls.actual_calls.is_empty()
                || !calls.mock_import_calls.is_empty()
                || !calls.unmock_calls.is_empty()
                || reset_required
                || !calls.runtime_calls.is_empty()))
    {
        bail!(
            "Static module mocks require direct vi.mock calls; aliases, computed access and \
             dynamic mock APIs are unsupported ({filename})."
        );
    }
    if calls.reset_calls.iter().any(|call| !call.args.is_empty()) {
        bail!("vi.resetModules currently requires no arguments ({filename}).");
    }
    // Member references demand the real cache, but certify no mock/helper combination.
    if calls.reset_method_reference
        && (!calls.calls.is_empty()
            || !calls.hoisted_calls.is_empty()
            || !calls.actual_calls.is_empty()
            || !calls.mock_import_calls.is_empty()
            || !calls.unmock_calls.is_empty()
            || !calls.runtime_calls.is_empty())
    {
        bail!(
            "Reset method references cannot currently combine with module mock or helper plans \
             ({filename})."
        );
    }
    // Each direct literal target owns factories, cuts, runtime registration and
    // an actual helper. Canonical identities remain independently certified.
    let top_level = |call: &CallExpr| {
        module.body.iter().any(|item| {
            matches!(item,
            ModuleItem::Stmt(Stmt::Expr(stmt)) if matches!(&*stmt.expr,
                Expr::Call(top) if top.span == call.span))
        })
    };
    let native_unmock_sequence = allow_runtime
        && !calls.unmock_calls.is_empty()
        && !calls.calls.is_empty()
        && !calls.actual_calls.is_empty()
        && !calls.reset_calls.is_empty()
        && calls.calls.iter().all(|factory| {
            native_static_request(factory).is_some_and(|request| {
                !request.contains(':')
                    && top_level(factory)
                    && calls
                        .unmock_calls
                        .iter()
                        .any(|cut| native_static_request(cut) == Some(request))
                    && calls
                        .actual_calls
                        .iter()
                        .any(|actual| native_static_request(actual) == Some(request))
                    && calls.runtime_calls.iter().any(|(registration, runtime)| {
                        *registration && native_static_request(runtime) == Some(request)
                    })
            })
        })
        && calls.unmock_calls.iter().all(|cut| {
            native_static_request(cut).is_some_and(|request| {
                cut.args.len() == 1
                    && top_level(cut)
                    && calls
                        .calls
                        .iter()
                        .any(|factory| native_static_request(factory) == Some(request))
                    && calls.calls.iter().all(|factory| {
                        cut.span.hi <= factory.span.lo || cut.span.lo >= factory.span.hi
                    })
            })
        });
    let native_static = allow_runtime
        && !calls.runtime_calls.is_empty()
        && !calls.calls.is_empty()
        && (calls.hoisted_calls.is_empty()
            || (calls.actual_calls.is_empty() && calls.unmock_calls.is_empty()))
        && calls.actual_calls.iter().all(|call| {
            native_static_request(call).is_some_and(|request| {
                calls
                    .calls
                    .iter()
                    .any(|declaration| native_static_request(declaration) == Some(request))
                    && calls
                        .runtime_calls
                        .iter()
                        .any(|(_, runtime)| native_static_request(runtime) == Some(request))
            })
        })
        && calls.mock_import_calls.is_empty()
        && (calls.unmock_calls.is_empty() || native_unmock_sequence)
        && calls
            .calls
            .iter()
            .all(|call| native_static_request(call).is_some())
        && calls
            .runtime_calls
            .iter()
            .all(|(_, call)| native_static_request(call).is_some());
    let native_hoisted_runtime = allow_runtime
        && !calls.runtime_calls.is_empty()
        && !calls.hoisted_calls.is_empty()
        && calls.calls.is_empty()
        && calls.actual_calls.is_empty()
        && calls.mock_import_calls.is_empty()
        && calls.unmock_calls.is_empty()
        && calls
            .runtime_calls
            .iter()
            .all(|(_, call)| native_static_request(call).is_some());
    // Compiler candidates still need actual CommonJS graph/namespace certificates.
    // The static-only extractor deliberately keeps its existing rejection below.
    let actual_reset = allow_runtime
        && !calls.actual_calls.is_empty()
        && calls.calls.is_empty()
        && calls.hoisted_calls.is_empty()
        && calls.mock_import_calls.is_empty()
        && calls.unmock_calls.is_empty()
        && calls.runtime_calls.is_empty();
    let commonjs_original_reset = allow_runtime
        && calls.calls.len() == 1
        && top_level(&calls.calls[0])
        && calls.hoisted_calls.is_empty()
        && calls.actual_calls.is_empty()
        && calls.mock_import_calls.is_empty()
        && calls.unmock_calls.is_empty()
        && calls.runtime_calls.is_empty()
        && matches!(calls.calls[0].args.first(), Some(argument)
            if argument.spread.is_none() && matches!(&*argument.expr, Expr::Lit(Lit::Str(request))
                if request.value.as_str().is_some_and(|request|
                    (request.starts_with("./") || request.starts_with("../"))
                    && !request.contains(['?', '#', '\\']))));
    if !calls.reset_calls.is_empty()
        && !commonjs_original_reset
        && !native_static
        && !native_hoisted_runtime
        && !actual_reset
        && (!calls.calls.is_empty()
            || !calls.hoisted_calls.is_empty()
            || !calls.actual_calls.is_empty()
            || !calls.mock_import_calls.is_empty()
            || !calls.unmock_calls.is_empty())
    {
        bail!(
            "vi.resetModules cannot currently combine with static mock, hoisted or actual-import \
             plans ({filename})."
        );
    }
    let mut runtime_requests = Vec::new();
    let mut throw_only_runtime_requests = Vec::new();
    if !calls.runtime_calls.is_empty() {
        let mut imports = RuntimeImportShape::default();
        module.visit_with(&mut imports);
        if imports.0 {
            bail!("Runtime mock imports require direct literals without attributes ({filename}).");
        }
        if (!calls.calls.is_empty() && !native_static)
            || (!native_static && !native_hoisted_runtime && !calls.hoisted_calls.is_empty())
            || (!native_static && !calls.actual_calls.is_empty())
            || !calls.mock_import_calls.is_empty()
            || (!native_static && !calls.unmock_calls.is_empty())
        {
            bail!("Runtime module mocks cannot combine with hoisted mock helpers ({filename}).");
        }
        for (registration, call) in &calls.runtime_calls {
            let arity = if *registration { 2 } else { 1 };
            if call.args.len() != arity
                || call.args.iter().any(|argument| argument.spread.is_some())
            {
                bail!(
                    "Runtime module mocks require a literal target and an inline factory \
                     ({filename})."
                );
            }
            let Expr::Lit(Lit::Str(request)) = &*call.args[0].expr else {
                bail!("Runtime module mock targets must be string literals ({filename}).");
            };
            let Some(request) = request.value.as_str().filter(|request| !request.is_empty()) else {
                bail!("Runtime module mock targets must be nonempty string literals ({filename}).");
            };
            if request.contains('?') || request.strip_prefix('#').unwrap_or(request).contains('#') {
                bail!(
                    "Runtime module mock query and fragment targets are unsupported ({filename})."
                );
            }
            if *registration {
                let factory = &*call.args[1].expr;
                if !matches!(factory, Expr::Arrow(_) | Expr::Fn(_)) {
                    bail!("Runtime module mocks require an inline lexical factory ({filename}).");
                }
                let mut exports = FactoryExports::default();
                inspect_factory_returns(factory, &mut exports);
                let terminal_throw =
                    !exports.has_object_return && runtime_factory_ends_in_throw(factory);
                if terminal_throw
                    && !throw_only_runtime_requests
                        .iter()
                        .any(|known| known == request)
                {
                    throw_only_runtime_requests.push(request.to_owned());
                }
                if exports.invalid
                    || (!exports.has_object_return && !terminal_throw)
                    || exports
                        .names
                        .iter()
                        .any(|name| matches!(name.as_str(), "then" | "__proto__"))
                {
                    bail!(
                        "Runtime mock factories currently require static object keys without then \
                         or prototype mutation ({filename})."
                    );
                }
                let mut imports = DynamicImports::default();
                factory.visit_with(&mut imports);
                if imports.0 {
                    bail!(
                        "Dynamic imports inside runtime mock factories are not implemented \
                         ({filename})."
                    );
                }
            }
            if !runtime_requests.iter().any(|known| known == request) {
                runtime_requests.push(request.to_owned());
            }
        }
        if !native_static && !native_hoisted_runtime {
            return Ok(StaticMockPlan {
                source: source.into(),
                declarations: Vec::new(),
                hoisted: Vec::new(),
                actual_imports: Vec::new(),
                mock_imports: Vec::new(),
                unmocks: Vec::new(),
                api_bindings,
                reset_modules: reset_required,
                runtime_requests,
                throw_only_runtime_requests,
            });
        }
    }
    let reset_modules = reset_required;
    // SWC removes the leading UTF-8 BOM before assigning byte spans. Until
    // extraction and both composed maps account for that normalization, fail
    // explicitly rather than slicing a factory at the wrong source offset.
    if (!calls.calls.is_empty()
        || !calls.hoisted_calls.is_empty()
        || !calls.actual_calls.is_empty()
        || !calls.mock_import_calls.is_empty()
        || !calls.unmock_calls.is_empty())
        && source.starts_with('\u{feff}')
    {
        bail!("Static module mocks in BOM-prefixed specs are unsupported ({filename}).");
    }
    let offset = |span: Span| (span.lo.0 - start_pos) as usize;
    let mut actual_imports = Vec::new();
    let mut actual_edits = Vec::new();
    for call in &calls.actual_calls {
        if call.args.len() != 1 || call.args[0].spread.is_some() {
            bail!("vi.importActual requires one literal target ({filename}).");
        }
        let Expr::Lit(Lit::Str(request)) = &*call.args[0].expr else {
            bail!("vi.importActual target must be a string literal ({filename}).");
        };
        let Some(request) = request.value.as_str().filter(|request| !request.is_empty()) else {
            bail!("vi.importActual target must be a nonempty string literal ({filename}).");
        };
        if request.contains('?') || request.strip_prefix('#').unwrap_or(request).contains('#') {
            bail!(
                "vi.importActual targets with query strings or fragments are unsupported \
                 ({filename})."
            );
        }
        let mut index = actual_imports.len();
        let local = loop {
            let candidate = format!("_a{index}");
            if !source.contains(&candidate)
                && !actual_imports
                    .iter()
                    .any(|import: &StaticActualImport| import.local == candidate)
            {
                break candidate;
            }
            index += 1;
        };
        let Callee::Expr(callee) = &call.callee else {
            unreachable!()
        };
        let start = offset(callee.span());
        let end = (callee.span().hi.0 - start_pos) as usize;
        actual_edits.push(SourceEdit {
            start,
            end,
            replacement: padded_replacement(&source[start..end], &local)?,
        });
        actual_imports.push(StaticActualImport {
            request: request.into(),
            local,
        });
    }
    let mut identifier_names = IdentifierNames::default();
    module.visit_with(&mut identifier_names);
    let mut mock_imports = Vec::new();
    for call in &calls.mock_import_calls {
        if call.args.len() != 1 || call.args[0].spread.is_some() {
            bail!("vi.importMock requires one literal target ({filename}).");
        }
        let Expr::Lit(Lit::Str(request)) = &*call.args[0].expr else {
            bail!("vi.importMock target must be a string literal ({filename}).");
        };
        let Some(request) = request.value.as_str().filter(|request| !request.is_empty()) else {
            bail!("vi.importMock target must be a nonempty string literal ({filename}).");
        };
        if request.contains('?') || request.strip_prefix('#').unwrap_or(request).contains('#') {
            bail!(
                "vi.importMock targets with query strings or fragments are unsupported \
                 ({filename})."
            );
        }
        let mut index = mock_imports.len();
        let local = loop {
            let candidate = format!("_m{index}");
            if !source.contains(&candidate)
                && !identifier_names.0.contains(&candidate)
                && !mock_imports
                    .iter()
                    .any(|import: &StaticActualImport| import.local == candidate)
            {
                break candidate;
            }
            index += 1;
        };
        let Callee::Expr(callee) = &call.callee else {
            unreachable!()
        };
        let start = offset(callee.span());
        let end = (callee.span().hi.0 - start_pos) as usize;
        actual_edits.push(SourceEdit {
            start,
            end,
            replacement: padded_replacement(&source[start..end], &local)?,
        });
        mock_imports.push(StaticActualImport {
            request: request.into(),
            local,
        });
    }
    actual_edits.sort_by_key(|edit| edit.start);
    let mut hoisted = Vec::new();
    let mut hoisted_ids = HashSet::new();
    let mut hoisted_objects = HashMap::new();
    let mut hoisted_nodes = Vec::new();
    for call in &calls.hoisted_calls {
        if call.args.len() != 1
            || call.args[0].spread.is_some()
            || !matches!(&*call.args[0].expr, Expr::Arrow(_) | Expr::Fn(_))
        {
            bail!("vi.hoisted requires one inline factory ({filename}).");
        }
        let statement = module
            .body
            .iter()
            .find_map(|item| {
                let ModuleItem::Stmt(statement) = item else {
                    return None;
                };
                let direct = match statement {
                    Stmt::Decl(Decl::Var(declaration)) if declaration.decls.len() == 1 => {
                        declaration.decls[0]
                            .init
                            .as_deref()
                            .and_then(hoisted_call)
                            .is_some_and(|top| top.span == call.span)
                    }
                    Stmt::Expr(expression) => {
                        hoisted_call(&expression.expr).is_some_and(|top| top.span == call.span)
                    }
                    _ => false,
                };
                direct.then_some(statement)
            })
            .ok_or_else(|| {
                anyhow::anyhow!(
                    "vi.hoisted must be a top-level expression or a single variable declaration; \
                     exported and nested hoisted declarations are unsupported ({filename})."
                )
            })?;
        let mut local_bindings = LocalBindings::default();
        if let Stmt::Decl(Decl::Var(declaration)) = statement {
            declaration.decls[0].name.visit_with(&mut local_bindings);
            if let Pat::Ident(binding) = &declaration.decls[0].name {
                let mut exports = FactoryExports {
                    hoisted_objects: hoisted_objects.clone(),
                    ..Default::default()
                };
                inspect_factory_returns(&call.args[0].expr, &mut exports);
                if !exports.invalid && exports.has_object_return {
                    hoisted_objects.insert(binding.to_id(), exports.names);
                }
            }
        }
        hoisted_ids.extend(local_bindings.0.iter().cloned());
        let names = local_bindings
            .0
            .into_iter()
            .map(|id| id.0.to_string())
            .collect::<Vec<_>>();
        hoisted_nodes.push((statement, call, names));
    }
    for (statement, call, mut names) in hoisted_nodes {
        let mut locals = LocalBindings::default();
        call.args[0].expr.visit_with(&mut locals);
        locals.0.extend(hoisted_ids.iter().cloned());
        locals.0.extend(bindings.iter().cloned());
        let mut captures = FactoryReferences {
            locals: &locals.0,
            unresolved,
            actual_apis: &bindings,
            allow_imports: true,
            allow_globals: true,
            allow_nested_this: false,
            owns_this: false,
            invalid: None,
        };
        call.args[0].expr.visit_with(&mut captures);
        if let Some(reason) = captures.invalid {
            bail!(
                "Unsupported vi.hoisted factory in {filename}: {reason}. Hoisted helpers run \
                 before ordinary spec imports."
            );
        }
        let start = offset(statement.span());
        let end = (statement.span().hi.0 - start_pos) as usize;
        names.sort();
        let mut imports = DynamicImports::default();
        call.args[0].expr.visit_with(&mut imports);
        hoisted.push(HoistedDeclaration {
            source: edited_range(source, start, end, &actual_edits)?,
            original_source: source[start..end].into(),
            start,
            bindings: names,
            has_dynamic_import: imports.0,
        });
    }
    let mut declarations = Vec::new();
    let mut masks = Vec::new();
    if calls.mock_import_calls.iter().any(|import| {
        calls
            .hoisted_calls
            .iter()
            .chain(calls.calls.iter())
            .any(|outer| import.span.lo >= outer.span.lo && import.span.hi <= outer.span.hi)
    }) {
        bail!(
            "vi.importMock inside hoisted callbacks or mock factories is not implemented \
             ({filename})."
        );
    }
    if !calls.unmock_calls.is_empty() && hoisted.iter().any(|helper| helper.has_dynamic_import) {
        bail!(
            "vi.unmock cannot currently combine with dynamic imports in vi.hoisted ({filename})."
        );
    }
    let mut unmocks = Vec::new();
    for call in &calls.unmock_calls {
        let top_level = module.body.iter().any(|item| matches!(item,
            ModuleItem::Stmt(Stmt::Expr(stmt)) if matches!(&*stmt.expr, Expr::Call(top) if top.span == call.span)));
        if !top_level || call.args.len() != 1 || call.args[0].spread.is_some() {
            bail!("vi.unmock requires one literal target in a top-level expression ({filename}).");
        }
        let request = match &*call.args[0].expr {
            Expr::Lit(Lit::Str(request)) => request,
            Expr::Call(import)
                if matches!(import.callee, Callee::Import(_))
                    && import.args.len() == 1
                    && import.args[0].spread.is_none() =>
            {
                let Expr::Lit(Lit::Str(request)) = &*import.args[0].expr else {
                    bail!("vi.unmock import() target must contain a string literal ({filename}).");
                };
                request
            }
            _ => {
                bail!("vi.unmock target must be a string literal or literal import() ({filename}).")
            }
        };
        let Some(request) = request.value.as_str().filter(|request| !request.is_empty()) else {
            bail!("vi.unmock requires a nonempty literal target ({filename}).");
        };
        if request.contains('?') || request.strip_prefix('#').unwrap_or(request).contains('#') {
            bail!("vi.unmock query and fragment targets are unsupported ({filename}).");
        }
        let start = offset(call.span);
        let end = (call.span.hi.0 - start_pos) as usize;
        masks.push(SourceEdit {
            start,
            end,
            replacement: padded_replacement(&source[start..end], "")?,
        });
        unmocks.push(StaticUnmockDeclaration {
            request: request.into(),
            start,
            end,
        });
    }
    for call in calls.calls {
        let top_level = module.body.iter().any(|item| matches!(item,
            ModuleItem::Stmt(Stmt::Expr(stmt)) if matches!(&*stmt.expr, Expr::Call(top) if top.span == call.span)));
        if !top_level {
            bail!("vi.mock must be a top-level expression in the spec ({filename}).");
        }
        if !(1..=2).contains(&call.args.len()) || call.args.iter().any(|arg| arg.spread.is_some()) {
            bail!("vi.mock requires a literal target and an optional inline factory ({filename}).");
        }
        let request = match &*call.args[0].expr {
            Expr::Lit(Lit::Str(request)) => request,
            Expr::Call(import)
                if matches!(import.callee, Callee::Import(_))
                    && import.args.len() == 1
                    && import.args[0].spread.is_none() =>
            {
                let Expr::Lit(Lit::Str(request)) = &*import.args[0].expr else {
                    bail!("vi.mock import() target must contain a string literal ({filename}).");
                };
                request
            }
            _ => {
                bail!("vi.mock target must be a string literal or literal import() ({filename}).");
            }
        };
        let Some(request) = request.value.as_str() else {
            bail!("Invalid mock target string ({filename}).")
        };
        if request.is_empty() {
            bail!("Mock target must not be empty ({filename}).")
        }
        if request.contains('?') || request.strip_prefix('#').unwrap_or(request).contains('#') {
            bail!(
                "Module mock targets with query strings or fragments are unsupported ({filename})."
            );
        }
        let mock_options = if call.args.len() == 1 {
            Some(false)
        } else {
            static_mock_options(&call.args[1].expr, unresolved)
        };
        if let Some(spy) = mock_options {
            let start = offset(call.span);
            let end = (call.span.hi.0 - start_pos) as usize;
            masks.push(SourceEdit {
                start,
                end,
                replacement: padded_replacement(&source[start..end], "")?,
            });
            declarations.push(StaticMockDeclaration {
                request: request.into(),
                factory_source: String::new(),
                original_factory_source: String::new(),
                factory_start: start,
                export_names: Vec::new(),
                has_spread: false,
                has_object_return: false,
                has_parameters: false,
                has_reset_factory_escape: true,
                automatic: true,
                spy,
            });
            continue;
        }
        let factory = &*call.args[1].expr;
        if !matches!(factory, Expr::Arrow(_) | Expr::Fn(_)) {
            bail!("vi.mock requires an inline factory function ({filename}).");
        }
        if matches!(factory, Expr::Fn(function) if function.function.is_generator) {
            bail!("Generator mock factories are unsupported ({filename}).");
        }
        let mut locals = LocalBindings::default();
        factory.visit_with(&mut locals);
        locals.0.extend(hoisted_ids.iter().cloned());
        // The emitted registration imports these exact API bindings before any
        // factory runs. Ordinary spec imports remain unavailable during hoisting.
        locals.0.extend(bindings.iter().cloned());
        let mut captures = FactoryReferences {
            locals: &locals.0,
            unresolved,
            actual_apis: &bindings,
            allow_imports: false,
            allow_globals: false,
            allow_nested_this: true,
            owns_this: false,
            invalid: None,
        };
        captures.visit_factory_root(factory);
        if let Some(reason) = captures.invalid {
            bail!(
                "Unsupported vi.mock factory in {filename}: {reason}. Factories are hoisted \
                 before spec imports."
            );
        }
        // Imported API binding identities and loader syntax are actual AST facts.
        // Zero formal parameters alone cannot exclude an arguments/helper escape.
        let mut reset_references = ResetFactoryReferences {
            bindings: &bindings,
            escaped: false,
        };
        factory.visit_with(&mut reset_references);
        let mut reset_loaders = CjsSpyLoaderSyntax::default();
        factory.visit_with(&mut reset_loaders);
        let original = match factory {
            Expr::Arrow(arrow) => arrow.params.first(),
            Expr::Fn(function) => function.function.params.first().map(|param| &param.pat),
            _ => None,
        }
        .and_then(|pattern| match pattern {
            Pat::Ident(ident) => Some(ident.to_id()),
            _ => None,
        });
        let actual_calls = calls.actual_calls.iter().filter(|actual| {
            matches!(&*actual.args[0].expr, Expr::Lit(Lit::Str(value)) if value.value.as_str() == Some(request))
        }).map(|actual| actual.span).collect::<HashSet<_>>();
        let mut original_bindings = OriginalBindings {
            original: original.as_ref(),
            actual_calls: &actual_calls,
            bindings: HashSet::new(),
            mutated: false,
        };
        factory.visit_with(&mut original_bindings);
        if original_bindings.mutated {
            bail!("Reassigning the importOriginal callback is unsupported ({filename}).");
        }
        let original_bindings = original_bindings.bindings;
        let mut exports = FactoryExports {
            original,
            original_bindings,
            actual_calls,
            hoisted_objects: hoisted_objects.clone(),
            ..Default::default()
        };
        inspect_factory_returns(factory, &mut exports);
        if exports.invalid {
            bail!(
                "Mock factory exports require static object keys and only verified importOriginal \
                 namespace spreads ({filename})."
            )
        }
        let start = offset(call.span);
        let end = (call.span.hi.0 - start_pos) as usize;
        let factory_start = offset(factory.span());
        let factory_end = (factory.span().hi.0 - start_pos) as usize;
        masks.push(SourceEdit {
            start,
            end,
            replacement: padded_replacement(&source[start..end], "")?,
        });
        exports.names.sort();
        exports.names.dedup();
        declarations.push(StaticMockDeclaration {
            request: request.into(),
            factory_source: edited_range(source, factory_start, factory_end, &actual_edits)?,
            original_factory_source: source[factory_start..factory_end].into(),
            factory_start,
            export_names: exports.names,
            has_spread: exports.has_spread,
            has_object_return: exports.has_object_return,
            has_parameters: match factory {
                Expr::Arrow(arrow) => !arrow.params.is_empty(),
                Expr::Fn(function) => !function.function.params.is_empty(),
                _ => true,
            },
            has_reset_factory_escape: reset_references.escaped || reset_loaders.0,
            automatic: false,
            spy: false,
        });
    }
    let mut writes = HoistedBindingWrites {
        bindings: &hoisted_ids,
        invalid: false,
    };
    module.visit_with(&mut writes);
    if writes.invalid {
        bail!(
            "Reassigning hoisted bindings from the spec is unsupported ({filename}); mutate \
             properties of a hoisted object instead."
        );
    }
    masks.extend(hoisted.iter().map(|declaration| SourceEdit {
        start: declaration.start,
        end: declaration.start + declaration.original_source.len(),
        replacement:
            padded_replacement(&declaration.original_source, "").expect("empty replacement fits"),
    }));
    let unmasked_actual_edits = actual_edits
        .into_iter()
        .filter(|edit| {
            !masks
                .iter()
                .any(|mask| edit.start >= mask.start && edit.end <= mask.end)
        })
        .collect::<Vec<_>>();
    masks.extend(unmasked_actual_edits);
    masks.sort_by_key(|edit| edit.start);
    let plan = StaticMockPlan {
        source: edited_range(source, 0, source.len(), &masks)?,
        declarations,
        hoisted,
        actual_imports,
        mock_imports,
        unmocks,
        api_bindings,
        reset_modules,
        runtime_requests,
        throw_only_runtime_requests,
    };
    if reset_modules && commonjs_original_reset && !plan.commonjs_original_reset_candidate() {
        bail!(
            "vi.resetModules cannot currently combine with this static factory plan ({filename})."
        );
    }
    Ok(plan)
}

struct ResetFactoryReferences<'a> {
    bindings: &'a HashSet<Id>,
    escaped: bool,
}
impl Visit for ResetFactoryReferences<'_> {
    fn visit_ident(&mut self, ident: &Ident) {
        self.escaped |= self.bindings.contains(&ident.to_id());
    }
    fn visit_member_expr(&mut self, member: &MemberExpr) {
        // This initial role has no reflective/computed factory lookup contract.
        self.escaped |= matches!(member.prop, MemberProp::Computed(_));
        member.visit_children_with(self);
    }
    fn visit_ts_type(&mut self, _: &TsType) {}
}

fn hoisted_call(expr: &Expr) -> Option<&CallExpr> {
    match expr {
        Expr::Call(call) => Some(call),
        Expr::Await(expr) => hoisted_call(&expr.arg),
        Expr::Paren(expr) => hoisted_call(&expr.expr),
        _ => None,
    }
}
fn static_mock_options(expr: &Expr, unresolved: SyntaxContext) -> Option<bool> {
    match expr {
        Expr::Ident(ident) if ident.sym == "undefined" && ident.ctxt == unresolved => Some(false),
        Expr::Paren(expr) => static_mock_options(&expr.expr, unresolved),
        Expr::TsAs(expr) => static_mock_options(&expr.expr, unresolved),
        Expr::TsConstAssertion(expr) => static_mock_options(&expr.expr, unresolved),
        Expr::TsSatisfies(expr) => static_mock_options(&expr.expr, unresolved),
        Expr::Object(object) => {
            let mut spy = false;
            for prop in &object.props {
                let PropOrSpread::Prop(prop) = prop else {
                    return None;
                };
                let Prop::KeyValue(prop) = &**prop else {
                    return None;
                };
                let name = match &prop.key {
                    PropName::Ident(ident) => ident.sym.as_ref(),
                    PropName::Str(value) => value.value.as_str()?,
                    _ => return None,
                };
                if name != "spy" {
                    return None;
                }
                let Expr::Lit(Lit::Bool(value)) = &*prop.value else {
                    return None;
                };
                spy = value.value;
            }
            Some(spy)
        }
        _ => None,
    }
}

fn runtime_factory_ends_in_throw(factory: &Expr) -> bool {
    let body = match factory {
        Expr::Arrow(arrow) => match &*arrow.body {
            ArrowFunctionBody::FunctionBody(body) => Some(body),
            _ => None,
        },
        Expr::Fn(function) => function.function.body.as_ref(),
        _ => None,
    };
    body.is_some_and(|body| matches!(body.stmts.last(), Some(Stmt::Throw(_))))
}

fn inspect_factory_returns(factory: &Expr, exports: &mut FactoryExports) {
    match factory {
        Expr::Arrow(arrow) => match &*arrow.body {
            ArrowFunctionBody::Expr(expr) => exports.return_value(expr),
            ArrowFunctionBody::FunctionBody(body) => body.visit_with(exports),
        },
        Expr::Fn(function) => {
            if let Some(body) = &function.function.body {
                body.visit_with(exports);
            }
        }
        _ => {}
    }
}
fn padded_replacement(original: &str, replacement: &str) -> Result<String> {
    let mut inserted = replacement.is_empty();
    let mut result = String::new();
    for segment in original.split_inclusive(['\r', '\n', '\u{2028}', '\u{2029}']) {
        let width = segment
            .chars()
            .take_while(|character| !matches!(character, '\r' | '\n' | '\u{2028}' | '\u{2029}'))
            .map(char::len_utf16)
            .sum::<usize>();
        let mut remaining = width;
        if !inserted && replacement.len() <= width {
            result.push_str(replacement);
            remaining -= replacement.len();
            inserted = true;
        }
        result.extend(std::iter::repeat_n(' ', remaining));
        for character in segment
            .chars()
            .filter(|character| matches!(character, '\r' | '\n' | '\u{2028}' | '\u{2029}'))
        {
            result.push(character);
        }
    }
    if !inserted {
        bail!("Compiler importActual helper does not fit original source coordinates");
    }
    Ok(result)
}
fn edited_range(source: &str, start: usize, end: usize, edits: &[SourceEdit]) -> Result<String> {
    let mut result = String::new();
    let mut previous = start;
    for edit in edits
        .iter()
        .filter(|edit| edit.start >= start && edit.end <= end)
    {
        if edit.start < previous {
            bail!("Overlapping test compiler source edits");
        }
        result.push_str(&source[previous..edit.start]);
        result.push_str(&edit.replacement);
        previous = edit.end;
    }
    result.push_str(&source[previous..end]);
    Ok(result)
}
struct HoistedBindingWrites<'a> {
    bindings: &'a HashSet<Id>,
    invalid: bool,
}
impl Visit for HoistedBindingWrites<'_> {
    fn visit_assign_expr(&mut self, assignment: &AssignExpr) {
        if let AssignTarget::Simple(SimpleAssignTarget::Ident(ident)) = &assignment.left {
            self.invalid |= self.bindings.contains(&ident.to_id());
        }
        assignment.visit_children_with(self);
    }
    fn visit_update_expr(&mut self, update: &UpdateExpr) {
        if let Expr::Ident(ident) = &*update.arg {
            self.invalid |= self.bindings.contains(&ident.to_id());
        }
        update.visit_children_with(self);
    }
}

// An admitted identity observer must remain the actual imported expectation
// function. Alias, mutation, extension, computed access and namespace escapes
// all visit its binding as a value and invalidate this bounded observation.
struct IdentityObserverUses<'a> {
    bindings: &'a HashSet<Id>,
    invalid: bool,
}
impl Visit for IdentityObserverUses<'_> {
    fn visit_call_expr(&mut self, call: &CallExpr) {
        if matches!(&call.callee, Callee::Expr(callee) if matches!(&**callee, Expr::Ident(ident) if self.bindings.contains(&ident.to_id())))
        {
            call.args.visit_with(self);
            return;
        }
        call.visit_children_with(self);
    }
    fn visit_ident(&mut self, ident: &Ident) {
        self.invalid |= self.bindings.contains(&ident.to_id());
    }
    fn visit_import_decl(&mut self, _: &ImportDecl) {}
    fn visit_ts_type(&mut self, _: &TsType) {}
}

struct ApiAliases<'a> {
    bindings: &'a HashSet<Id>,
    aliases: HashSet<Id>,
}

impl Visit for ApiAliases<'_> {
    fn visit_var_declarator(&mut self, declaration: &VarDeclarator) {
        if matches!(declaration.init.as_deref(), Some(Expr::Ident(ident)) if self.bindings.contains(&ident.to_id()))
            && let Pat::Ident(alias) = &declaration.name
        {
            self.aliases.insert(alias.id.to_id());
        }
        declaration.visit_children_with(self);
    }
    fn visit_import_decl(&mut self, _: &ImportDecl) {}
    fn visit_ts_type(&mut self, _: &TsType) {}
}

struct MockCalls<'a> {
    bindings: &'a HashSet<Id>,
    alias_bindings: &'a HashSet<Id>,
    identity_observers: &'a HashSet<Id>,
    identity_observation: bool,
    strict_identity_observation: bool,
    calls: Vec<CallExpr>,
    hoisted_calls: Vec<CallExpr>,
    actual_calls: Vec<CallExpr>,
    mock_import_calls: Vec<CallExpr>,
    unmock_calls: Vec<CallExpr>,
    reset_calls: Vec<CallExpr>,
    /// A real member value use demands a cache without certifying a direct call.
    reset_method_reference: bool,
    runtime_calls: Vec<(bool, CallExpr)>,
    allow_runtime: bool,
    invalid: bool,
    value_alias: bool,
}

impl Visit for MockCalls<'_> {
    fn visit_bin_expr(&mut self, expression: &BinExpr) {
        // Strict equality immediately produces a boolean. Observing the API
        // identity here cannot give another function a registration alias.
        if self.allow_runtime && matches!(expression.op, BinaryOp::EqEqEq | BinaryOp::NotEqEq) {
            let left_api = matches!(&*expression.left, Expr::Ident(ident) if self.bindings.contains(&ident.to_id()));
            let right_api = matches!(&*expression.right, Expr::Ident(ident) if self.bindings.contains(&ident.to_id()));
            if left_api || right_api {
                self.strict_identity_observation = true;
                if !left_api {
                    expression.left.visit_with(self);
                }
                if !right_api {
                    expression.right.visit_with(self);
                }
                return;
            }
        }
        expression.visit_children_with(self);
    }

    fn visit_var_declarator(&mut self, declaration: &VarDeclarator) {
        if matches!(declaration.init.as_deref(), Some(Expr::Ident(ident)) if self.bindings.contains(&ident.to_id()))
        {
            if let Pat::Object(pattern) = &declaration.name {
                for property in &pattern.props {
                    let name = match property {
                        ObjectPatProp::Assign(property) => Some(property.key.id.sym.as_ref()),
                        ObjectPatProp::KeyValue(property) => match &property.key {
                            PropName::Ident(name) => Some(name.sym.as_ref()),
                            PropName::Str(name) => name.value.as_str(),
                            PropName::Computed(name) => match &*name.expr {
                                Expr::Lit(Lit::Str(name)) => name.value.as_str(),
                                _ => None,
                            },
                            _ => None,
                        },
                        ObjectPatProp::Rest(_) => None,
                    };
                    if matches!(
                        name,
                        Some(
                            "mock"
                                | "doMock"
                                | "unmock"
                                | "doUnmock"
                                | "hoisted"
                                | "importActual"
                                | "importMock"
                                | "resetModules"
                        )
                    ) {
                        self.invalid = true;
                    }
                }
            }
        }
        declaration.visit_children_with(self);
    }

    fn visit_call_expr(&mut self, call: &CallExpr) {
        // Reading the API object for the imported builtin's strict identity
        // comparison does not create a reusable registration alias. Preserve
        // traversal of the expected expression (including resetModules).
        if self.allow_runtime
            && call.args.len() == 1
            && call.args[0].spread.is_none()
            && matches!(&*call.args[0].expr, Expr::Ident(ident) if self.bindings.contains(&ident.to_id()))
            && let Callee::Expr(callee) = &call.callee
            && let Expr::Member(member) = &**callee
            && matches!(&member.prop, MemberProp::Ident(name) if name.sym == "toBe")
            && let Expr::Call(observer) = &*member.obj
            && observer.args.len() == 1
            && observer.args[0].spread.is_none()
            && matches!(&observer.callee, Callee::Expr(callee) if matches!(&**callee, Expr::Ident(ident) if self.identity_observers.contains(&ident.to_id())))
        {
            self.identity_observation = true;
            observer.visit_with(self);
            return;
        }
        if let Callee::Expr(expr) = &call.callee {
            if let Expr::Member(member) = &**expr {
                if let Expr::Ident(object) = &*member.obj {
                    if self.bindings.contains(&object.to_id()) {
                        match &member.prop {
                            MemberProp::Ident(name) if name.sym == "mock" => {
                                self.calls.push(call.clone());
                                call.args.visit_with(self);
                                return;
                            }
                            MemberProp::Ident(name) if name.sym == "hoisted" => {
                                self.hoisted_calls.push(call.clone());
                                call.args.visit_with(self);
                                return;
                            }
                            MemberProp::Ident(name)
                                if self.allow_runtime
                                    && matches!(name.sym.as_ref(), "doMock" | "doUnmock") =>
                            {
                                self.runtime_calls
                                    .push((name.sym == "doMock", call.clone()));
                                call.args.visit_with(self);
                                return;
                            }
                            MemberProp::Ident(name) if name.sym == "resetModules" => {
                                self.reset_calls.push(call.clone());
                                return;
                            }
                            MemberProp::Ident(name) if name.sym == "importActual" => {
                                self.actual_calls.push(call.clone());
                                return;
                            }
                            MemberProp::Ident(name) if name.sym == "importMock" => {
                                self.mock_import_calls.push(call.clone());
                                return;
                            }
                            MemberProp::Ident(name) if name.sym == "unmock" => {
                                self.unmock_calls.push(call.clone());
                                call.args.visit_with(self);
                                return;
                            }
                            MemberProp::Ident(name)
                                if !matches!(
                                    name.sym.as_ref(),
                                    "doMock"
                                        | "unmock"
                                        | "doUnmock"
                                        | "hoisted"
                                        | "importActual"
                                        | "importMock"
                                        | "resetModules"
                                ) => {}
                            _ => self.invalid = true,
                        }
                    }
                }
            }
        }
        call.visit_children_with(self);
    }
    fn visit_import_decl(&mut self, _: &ImportDecl) {}
    fn visit_ts_type(&mut self, _: &TsType) {}
    fn visit_ident(&mut self, ident: &Ident) {
        if self.bindings.contains(&ident.to_id()) {
            self.value_alias = true;
        }
    }
    fn visit_member_expr(&mut self, member: &MemberExpr) {
        if let Expr::Ident(object) = &*member.obj {
            if self.alias_bindings.contains(&object.to_id()) {
                let name = match &member.prop {
                    MemberProp::Ident(name) => Some(name.sym.as_ref()),
                    MemberProp::Computed(property) => match &*property.expr {
                        Expr::Lit(Lit::Str(name)) => name.value.as_str(),
                        _ => None,
                    },
                    MemberProp::PrivateName(_) => None,
                };
                if matches!(
                    name,
                    Some(
                        "mock"
                            | "doMock"
                            | "unmock"
                            | "doUnmock"
                            | "hoisted"
                            | "importActual"
                            | "importMock"
                            | "resetModules"
                    )
                ) {
                    self.invalid = true;
                }
            }
            if self.bindings.contains(&object.to_id()) {
                if matches!(&member.prop, MemberProp::Ident(name) if name.sym == "resetModules") {
                    self.reset_method_reference = true;
                    return;
                }
                if !matches!(&member.prop, MemberProp::Ident(name) if !matches!(name.sym.as_ref(), "mock" | "doMock" | "unmock" | "doUnmock" | "hoisted" | "importActual" | "importMock" | "resetModules"))
                {
                    self.invalid = true;
                }
                return;
            }
        }
        member.visit_children_with(self);
    }
}

#[derive(Default)]
struct IdentifierNames(HashSet<String>);
impl Visit for IdentifierNames {
    fn visit_ident(&mut self, ident: &Ident) {
        self.0.insert(ident.sym.to_string());
    }
}

#[derive(Default)]
struct LocalBindings(HashSet<Id>);
impl Visit for LocalBindings {
    fn visit_binding_ident(&mut self, binding: &BindingIdent) {
        self.0.insert(binding.id.to_id());
    }
    fn visit_fn_expr(&mut self, function: &FnExpr) {
        if let Some(name) = &function.ident {
            self.0.insert(name.to_id());
        }
        function.visit_children_with(self);
    }
    fn visit_fn_decl(&mut self, function: &FnDecl) {
        self.0.insert(function.ident.to_id());
        function.visit_children_with(self);
    }
}

struct FactoryReferences<'a> {
    locals: &'a HashSet<Id>,
    unresolved: SyntaxContext,
    actual_apis: &'a HashSet<Id>,
    allow_imports: bool,
    allow_globals: bool,
    allow_nested_this: bool,
    owns_this: bool,
    invalid: Option<String>,
}
impl FactoryReferences<'_> {
    fn in_this_scope(
        &mut self,
        owns_this: bool,
        allow_nested_this: bool,
        visit: impl FnOnce(&mut Self),
    ) {
        let previous = (self.owns_this, self.allow_nested_this);
        self.owns_this = owns_this;
        self.allow_nested_this = allow_nested_this;
        visit(self);
        (self.owns_this, self.allow_nested_this) = previous;
    }

    fn visit_factory_root(&mut self, factory: &Expr) {
        // The factory itself keeps its old captured-this rule, including when
        // it is an ordinary function. Only nested callables gain a local this.
        if let Expr::Fn(function) = factory {
            function.ident.visit_with(self);
            function.function.visit_children_with(self);
        } else {
            factory.visit_with(self);
        }
    }

    fn visit_function_parts(
        &mut self,
        function: &Function,
        owns_this: bool,
        allow_nested_this: bool,
    ) {
        function.this_param.visit_with(self);
        for parameter in &function.params {
            // Decorators execute outside the callable whose parameter they
            // annotate. Parameter defaults execute with its actual receiver.
            parameter.decorators.visit_with(self);
            self.in_this_scope(owns_this, allow_nested_this, |visitor| {
                parameter.pat.visit_with(visitor);
            });
        }
        function.decorators.visit_with(self);
        self.in_this_scope(owns_this, allow_nested_this, |visitor| {
            function.body.visit_with(visitor);
            function.type_params.visit_with(visitor);
            function.return_type.visit_with(visitor);
        });
    }
}
impl Visit for FactoryReferences<'_> {
    fn visit_function(&mut self, function: &Function) {
        if self.allow_nested_this {
            self.visit_function_parts(function, true, true);
        } else {
            function.visit_children_with(self);
        }
    }

    // Class receivers remain outside this bounded ordinary-callable role.
    // Keys and decorators still execute in the enclosing evaluation scope.
    fn visit_class_method(&mut self, method: &ClassMethod) {
        method.key.visit_with(self);
        self.visit_function_parts(&method.function, false, false);
    }
    fn visit_private_method(&mut self, method: &PrivateMethod) {
        method.key.visit_with(self);
        self.visit_function_parts(&method.function, false, false);
    }
    fn visit_constructor(&mut self, constructor: &Constructor) {
        constructor.key.visit_with(self);
        for parameter in &constructor.params {
            match parameter {
                ParamOrTsParamProp::Param(parameter) => {
                    parameter.decorators.visit_with(self);
                    self.in_this_scope(false, false, |visitor| {
                        parameter.pat.visit_with(visitor);
                    });
                }
                ParamOrTsParamProp::TsParamProp(parameter) => {
                    parameter.decorators.visit_with(self);
                    self.in_this_scope(false, false, |visitor| {
                        parameter.param.visit_with(visitor);
                    });
                }
            }
        }
        self.in_this_scope(false, false, |visitor| {
            constructor.body.visit_with(visitor);
        });
    }
    fn visit_class_prop(&mut self, property: &ClassProp) {
        property.key.visit_with(self);
        self.in_this_scope(false, false, |visitor| {
            property.value.visit_with(visitor);
        });
        property.type_ann.visit_with(self);
        property.decorators.visit_with(self);
    }
    fn visit_private_prop(&mut self, property: &PrivateProp) {
        property.key.visit_with(self);
        self.in_this_scope(false, false, |visitor| {
            property.value.visit_with(visitor);
        });
        property.type_ann.visit_with(self);
        property.decorators.visit_with(self);
    }
    fn visit_static_block(&mut self, block: &StaticBlock) {
        self.in_this_scope(false, false, |visitor| {
            block.body.visit_with(visitor);
        });
    }
    fn visit_auto_accessor(&mut self, accessor: &AutoAccessor) {
        accessor.key.visit_with(self);
        self.in_this_scope(false, false, |visitor| {
            accessor.value.visit_with(visitor);
        });
        accessor.type_ann.visit_with(self);
        accessor.decorators.visit_with(self);
    }

    fn visit_jsx_element_name(&mut self, name: &JSXElementName) {
        if matches!(name, JSXElementName::Ident(ident) if ident.sym.starts_with(|character: char| character.is_ascii_lowercase()) || ident.sym.contains('-'))
        {
            return;
        }
        name.visit_children_with(self);
    }

    fn visit_ident(&mut self, ident: &Ident) {
        if self.locals.contains(&ident.to_id()) {
            return;
        }
        if ident.ctxt == self.unresolved
            && (self.allow_globals
                || matches!(
                    ident.sym.as_ref(),
                    "undefined"
                        | "NaN"
                        | "Infinity"
                        | "globalThis"
                        | "Promise"
                        | "Object"
                        | "Array"
                        | "String"
                        | "Number"
                        | "Boolean"
                        | "BigInt"
                        | "Symbol"
                        | "Math"
                        | "JSON"
                        | "Error"
                        | "TypeError"
                        | "RangeError"
                        | "Map"
                        | "Set"
                        | "RegExp"
                        | "Date"
                ))
        {
            return;
        }
        self.invalid
            .get_or_insert_with(|| format!("capture of {}", ident.sym));
    }
    fn visit_call_expr(&mut self, call: &CallExpr) {
        if matches!(&call.callee, Callee::Expr(callee) if matches!(&**callee, Expr::Member(member)
            if matches!(&*member.obj, Expr::Ident(ident) if self.actual_apis.contains(&ident.to_id()))
                && matches!(&member.prop, MemberProp::Ident(name) if name.sym == "importActual")))
        {
            call.args.visit_with(self);
            return;
        }
        if !self.allow_imports && matches!(call.callee, Callee::Import(_)) {
            self.invalid =
                Some("dynamic imports in factories are unsupported; use importOriginal".into());
        }
        call.visit_children_with(self);
    }
    fn visit_ts_type(&mut self, _: &TsType) {}
    fn visit_meta_prop_expr(&mut self, _: &MetaPropExpr) {
        self.invalid =
            Some("import.meta/new.target context cannot be preserved in a hoisted factory".into());
    }
    fn visit_this_expr(&mut self, _: &ThisExpr) {
        if !self.owns_this {
            self.invalid = Some("this capture is unsupported".into());
        }
    }
}

fn is_original_namespace(expr: &Expr, original: Option<&Id>, actual_calls: &HashSet<Span>) -> bool {
    let expr = match expr {
        Expr::Paren(expr) => return is_original_namespace(&expr.expr, original, actual_calls),
        _ => expr,
    };
    let Expr::Await(await_expr) = expr else {
        return false;
    };
    let Expr::Call(call) = &*await_expr.arg else {
        return false;
    };
    actual_calls.contains(&call.span)
        || (matches!(&call.callee, Callee::Expr(callee) if matches!(&**callee, Expr::Ident(ident) if Some(&ident.to_id()) == original))
            && call.args.is_empty())
}

struct OriginalBindings<'a> {
    original: Option<&'a Id>,
    actual_calls: &'a HashSet<Span>,
    bindings: HashSet<Id>,
    mutated: bool,
}
struct OriginalUse<'a> {
    original: Option<&'a Id>,
    found: bool,
}
impl Visit for OriginalUse<'_> {
    fn visit_ident(&mut self, ident: &Ident) {
        self.found |= Some(&ident.to_id()) == self.original;
    }
}
impl Visit for OriginalBindings<'_> {
    fn visit_for_head(&mut self, head: &ForHead) {
        let mut usage = OriginalUse {
            original: self.original,
            found: false,
        };
        head.visit_with(&mut usage);
        self.mutated |= usage.found;
        head.visit_children_with(self);
    }
    fn visit_fn_decl(&mut self, declaration: &FnDecl) {
        self.mutated |= Some(&declaration.ident.to_id()) == self.original;
        declaration.visit_children_with(self);
    }

    fn visit_assign_expr(&mut self, assignment: &AssignExpr) {
        let mut usage = OriginalUse {
            original: self.original,
            found: false,
        };
        assignment.left.visit_with(&mut usage);
        self.mutated |= usage.found;
        assignment.visit_children_with(self);
    }
    fn visit_update_expr(&mut self, update: &UpdateExpr) {
        let mut usage = OriginalUse {
            original: self.original,
            found: false,
        };
        update.arg.visit_with(&mut usage);
        self.mutated |= usage.found;
        update.visit_children_with(self);
    }
    fn visit_var_decl(&mut self, declaration: &VarDecl) {
        for binding in &declaration.decls {
            if binding.init.is_some() {
                let mut usage = OriginalUse {
                    original: self.original,
                    found: false,
                };
                binding.name.visit_with(&mut usage);
                self.mutated |= usage.found;
            }
        }

        if declaration.kind == VarDeclKind::Const {
            for binding in &declaration.decls {
                if let (Pat::Ident(ident), Some(init)) = (&binding.name, &binding.init) {
                    if is_original_namespace(init, self.original, self.actual_calls) {
                        self.bindings.insert(ident.to_id());
                    }
                }
            }
        }
        declaration.visit_children_with(self);
    }
}

#[derive(Default)]
struct FactoryExports {
    original: Option<Id>,
    original_bindings: HashSet<Id>,
    actual_calls: HashSet<Span>,
    hoisted_objects: HashMap<Id, Vec<String>>,
    names: Vec<String>,
    has_spread: bool,
    has_object_return: bool,
    invalid: bool,
}
impl FactoryExports {
    fn return_value(&mut self, expr: &Expr) {
        let object = match expr {
            Expr::Object(object) => object,
            Expr::Ident(ident) if self.hoisted_objects.contains_key(&ident.to_id()) => {
                self.has_object_return = true;
                self.names
                    .extend(self.hoisted_objects[&ident.to_id()].iter().cloned());
                return;
            }
            Expr::Paren(expr) => return self.return_value(&expr.expr),
            Expr::TsAs(expr) => return self.return_value(&expr.expr),
            Expr::TsSatisfies(expr) => return self.return_value(&expr.expr),
            _ => {
                self.invalid = true;
                return;
            }
        };
        self.has_object_return = true;
        for prop in &object.props {
            match prop {
                PropOrSpread::Spread(spread) => {
                    if is_original_namespace(
                        &spread.expr,
                        self.original.as_ref(),
                        &self.actual_calls,
                    ) || matches!(&*spread.expr, Expr::Ident(ident) if self.original_bindings.contains(&ident.to_id()))
                    {
                        self.has_spread = true;
                    } else {
                        self.invalid = true;
                    }
                }
                PropOrSpread::Prop(prop) => {
                    let key = match &**prop {
                        Prop::Shorthand(ident) => {
                            self.names.push(ident.sym.to_string());
                            continue;
                        }
                        Prop::KeyValue(prop) => &prop.key,
                        Prop::Method(prop) => &prop.key,
                        Prop::Getter(_) | Prop::Setter(_) | Prop::Assign(_) => {
                            self.invalid = true;
                            continue;
                        }
                    };
                    match key {
                        PropName::Ident(ident) => self.names.push(ident.sym.to_string()),
                        PropName::Str(value) => match value.value.as_str() {
                            Some(name) => self.names.push(name.into()),
                            None => self.invalid = true,
                        },
                        PropName::Computed(name) if matches!(&**prop, Prop::Method(_)) => {
                            if let Expr::Lit(Lit::Str(value)) = &*name.expr {
                                match value.value.as_str() {
                                    Some(name) => self.names.push(name.into()),
                                    None => self.invalid = true,
                                }
                            } else {
                                self.invalid = true;
                            }
                        }
                        _ => self.invalid = true,
                    }
                }
            }
        }
    }
}
impl Visit for FactoryExports {
    fn visit_return_stmt(&mut self, stmt: &ReturnStmt) {
        if let Some(value) = &stmt.arg {
            self.return_value(value);
        }
    }
    fn visit_function(&mut self, _: &Function) {}
    fn visit_arrow_expr(&mut self, _: &ArrowExpr) {}
}

#[cfg(test)]
mod tests {
    use crate::testing_mock_source::{
        extract_static_mocks, extract_test_mocks, validate_mock_target_source,
    };

    #[test]
    fn retains_static_factory_and_runtime_calls_for_native_certification() {
        for request in ["package", "node:fs"] {
            let source = format!(
                "import {{vi}} from \
                 'vitest';vi.mock('{request}',()=>({{value:5}}));vi.doMock('{request}',\
                 ()=>({{value:73}}));vi.resetModules();vi.doUnmock('{request}')"
            );
            let plan = extract_test_mocks(&source, "native-static-runtime.mjs").unwrap();
            assert_eq!(plan.declarations.len(), 1);
            assert_eq!(plan.declarations[0].request, request);
            assert_eq!(plan.runtime_requests, [request]);
            assert!(plan.reset_modules);
            assert!(plan.source.contains("vi.doMock"));
            assert!(extract_static_mocks(&source, "native-static-runtime.mjs").is_err());
        }
    }

    #[test]
    fn retains_paired_native_runtime_actual_helpers() {
        for reset in ["", "vi.resetModules();"] {
            let source = format!(
                "import {{vi}} from \
                 'vitest';vi.mock('package',()=>({{value:5}}));vi.doMock('package',()=>({{value:\
                 73}}));{reset}vi.importActual('package')"
            );
            let plan = extract_test_mocks(&source, "native-runtime-actual.mjs").unwrap();
            assert_eq!(plan.declarations.len(), 1);
            assert_eq!(plan.runtime_requests, ["package"]);
            assert_eq!(plan.actual_imports.len(), 1);
            assert_eq!(plan.actual_imports[0].request, "package");
            assert!(!plan.source.contains("vi.importActual"));
            assert!(extract_static_mocks(&source, "native-runtime-actual.mjs").is_err());
        }
        for actual in ["./compiled.mjs", "other-package"] {
            let source = format!(
                "import {{vi}} from \
                 'vitest';vi.mock('package',()=>({{value:5}}));vi.doMock('package',()=>({{value:\
                 73}}));vi.importActual('{actual}')"
            );
            assert!(extract_test_mocks(&source, "unpaired-native-actual.mjs").is_err());
        }
    }

    #[test]
    fn keeps_compiled_and_unpaired_static_runtime_mixtures_rejected() {
        for source in ["vi.mock('./dep',()=>({value:5}));vi.doMock('./dep',()=>({value:73}))"] {
            assert!(
                extract_test_mocks(
                    &format!("import {{vi}} from 'vitest';{source}"),
                    "unpaired.mjs"
                )
                .is_err()
            );
        }
    }

    #[test]
    fn records_native_certificate_requirement_for_straight_line_throw_factories() {
        for factory in [
            "()=>{throw failure}",
            "function(){calls++;throw failure}",
            "async()=>{const value=1;throw failure}",
        ] {
            let source = format!("import {{vi}} from 'vitest';vi.doMock('package',{factory})");
            let plan = extract_test_mocks(&source, "native-throw.mjs").unwrap();
            assert_eq!(plan.source, source);
            assert_eq!(plan.runtime_requests, ["package"]);
            assert_eq!(plan.throw_only_runtime_requests, ["package"]);
            assert!(extract_static_mocks(&source, "native-throw.mjs").is_err());
        }
    }

    #[test]
    fn retains_compiled_terminal_throw_kind_without_rewriting_factory_sources() {
        for factory in [
            "()=>{throw failure}",
            "function(){calls++;throw failure}",
            "async()=>{throw failure}",
            "async()=>{calls++;await gate;throw failure}",
        ] {
            let source =
                format!("import {{vi}} from 'vitest';vi.doMock('./dependency.mjs',{factory})");
            let plan = extract_test_mocks(&source, "compiled-purethrow.mjs").unwrap();
            assert_eq!(plan.source, source);
            assert_eq!(plan.runtime_requests, ["./dependency.mjs"]);
            assert_eq!(plan.throw_only_runtime_requests, ["./dependency.mjs"]);
            assert!(plan.declarations.is_empty());
            assert!(extract_static_mocks(&source, "compiled-purethrow.mjs").is_err());
        }
    }

    #[test]
    fn retains_runtime_export_shape_rejections_without_a_straight_line_throw() {
        for factory in [
            "()=>{if(flag)throw failure}",
            "()=>{throw failure;effect()}",
            "()=>{if(flag)return dynamic;throw failure}",
            "()=>{function nested(){throw failure}}",
        ] {
            let source = format!("import {{vi}} from 'vitest';vi.doMock('package',{factory})");
            assert!(extract_test_mocks(&source, "native-throw-negative.mjs").is_err());
        }
        let plan = extract_test_mocks(
            "import {vi} from 'vitest';vi.doMock('./subject',()=>({value:1}))",
            "compiled.mjs",
        )
        .unwrap();
        assert!(plan.throw_only_runtime_requests.is_empty());
    }

    #[test]
    fn permits_immediate_strict_runtime_api_identity_without_source_edits() {
        for comparison in ["returned===vi", "vi!==returned", "vi===vi"] {
            let source = format!(
                "import {{vi}} from 'vitest';const returned=vi.resetModules();const \
                 same={comparison}"
            );
            let plan = extract_test_mocks(&source, "strict-identity.mjs").unwrap();
            assert!(plan.reset_modules);
            assert_eq!(plan.source, source);
            assert!(extract_static_mocks(&source, "strict-identity.mjs").is_err());
        }
        for body in [
            "const alias=vi;const same=vi===alias",
            "consume(vi);const same=vi===true",
            "const same=vi==true",
            "const same=vi.mock===undefined",
        ] {
            let source = format!("import {{vi}} from 'vitest';vi.resetModules();{body}");
            assert!(extract_test_mocks(&source, "strict-identity.mjs").is_err());
        }
        let ordinary = "import {vi} from 'vitest';const same=vi===true";
        assert!(
            extract_test_mocks(ordinary, "ordinary.mjs")
                .unwrap()
                .is_empty()
        );
        let static_mock =
            "import {vi} from 'vitest';vi.mock('./dep',()=>({value:1}));const same=vi===true";
        assert!(extract_test_mocks(static_mock, "static.mjs").is_err());
    }

    #[test]
    fn permits_builtin_runtime_api_identity_observation_without_source_edits() {
        for source in [
            "import {vi,expect} from \
             'vitest';vi.doUnmock('./dep.mjs');expect(vi.resetModules()).toBe(vi)",
            "import {vitest as tools,expect as assert} from \
             'vitest';tools.doUnmock('./dep.mjs');assert(tools.resetModules()).toBe(tools)",
            "import {vi,expect} from \
             'vitest';vi.doUnmock('./dep.mjs');expect(vi.resetModules()).toBe(vi);function \
             other(expect){expect.extend({})}",
        ] {
            let plan = extract_test_mocks(source, "identity.mjs").unwrap();
            assert!(plan.reset_modules);
            assert_eq!(plan.runtime_requests, ["./dep.mjs"]);
            assert_eq!(plan.source.as_bytes(), source.as_bytes());
            assert!(extract_static_mocks(source, "identity.mjs").is_err());
        }
    }

    #[test]
    fn leaves_ordinary_and_static_api_value_admission_unchanged() {
        let ordinary = "import {vi,expect} from 'vitest';expect.extend({});expect(42).toBe(vi)";
        let plan = extract_test_mocks(ordinary, "ordinary.mjs").unwrap();
        assert!(plan.is_empty());
        assert_eq!(plan.source, ordinary);
        let static_mock = "import {vi,expect} from \
                           'vitest';vi.mock('./dep.mjs',()=>({value:42}));expect(42).toBe(vi)";
        assert!(extract_test_mocks(static_mock, "static.mjs").is_err());
    }

    #[test]
    fn rejects_runtime_identity_observer_and_registration_escapes() {
        for body in [
            "const tool=vi;expect(vi.resetModules()).toBe(vi);tool.doMock('./dep.mjs',()=>({value:\
             1}))",
            "vi['doMock']('./dep.mjs',()=>({value:1}));expect(vi.resetModules()).toBe(vi)",
            "const register=vi.doMock;expect(vi.resetModules()).toBe(vi);register('./dep.mjs',\
             ()=>({value:1}))",
            "const alias=expect;expect(vi.resetModules()).toBe(vi)",
            "consume(expect);expect(vi.resetModules()).toBe(vi)",
            "expect.extend({toBe(){}});expect(vi.resetModules()).toBe(vi)",
            "expect['extend']({});expect(vi.resetModules()).toBe(vi)",
            "expect.toBe=someObserver;expect(vi.resetModules()).toBe(vi)",
            "function other(expect){expect(vi.resetModules()).toBe(vi)}",
            "fake(vi.resetModules()).toBe(vi)",
            "expect(vi).toBe(vi.resetModules())",
        ] {
            let source =
                format!("import {{vi,expect}} from 'vitest';vi.doUnmock('./dep.mjs');{body}");
            assert!(
                extract_test_mocks(&source, "identity.mjs").is_err(),
                "accepted {body}"
            );
        }
        let source = "import {vi} from 'vitest';import {expect} from \
                      './fake';vi.doUnmock('./dep.mjs');expect(vi.resetModules()).toBe(vi)";
        assert!(extract_test_mocks(source, "identity.mjs").is_err());
    }

    #[test]
    fn preserves_runtime_registration_source_closure_and_call_order() {
        let source = "import {test,vi} from 'vitest';test('runtime',async()=>{let calls=0; const \
                      value=42;vi.doMock('./dep.mjs',async()=>{calls++; await \
                      Promise.resolve();return {value}}); await \
                      import('./dep.mjs');vi.doUnmock('./dep.mjs');vi.resetModules(); await \
                      import('./dep.mjs')});";
        let plan = extract_test_mocks(source, "spec.mjs").unwrap();
        assert_eq!(plan.source.as_bytes(), source.as_bytes());
        assert_eq!(plan.runtime_requests, ["./dep.mjs"]);
        assert!(plan.reset_modules);
        assert!(!plan.is_empty());
        assert!(
            plan.declarations.is_empty()
                && plan.hoisted.is_empty()
                && plan.actual_imports.is_empty()
        );
        // The static-only API must not silently become a runtime extractor.
        assert!(extract_static_mocks(source, "spec.mjs").is_err());
    }

    #[test]
    fn runtime_registration_respects_actual_import_binding_shadowing() {
        let source = "import {vi as tools} from 'vitest';tools.doUnmock('./dep.mjs'); function \
                      shadow(tools){tools.doMock(computed,factory)}";
        let plan = extract_test_mocks(source, "spec.mjs").unwrap();
        assert_eq!(plan.runtime_requests, ["./dep.mjs"]);
        assert_eq!(plan.source, source);
        assert!(!plan.reset_modules);
    }

    #[test]
    fn rejects_unowned_runtime_requests_and_static_plan_mixtures() {
        for body in [
            "vi.doMock(name,()=>({value:1}))",
            "vi.doMock('./dep',factory)",
            "vi.doMock('./dep',()=>({then(){}}))",
            "vi.doMock('./dep',()=>({__proto__:someObject,value:1}))",
            "vi.doMock('./dep',()=>({...value}))",
            "vi.doMock('./dep',()=>value)",
            "vi.doMock('./dep',()=>({value:1}));import(name)",
            "vi.doMock('./dep',()=>({value:1}));import('./dep',{with:{type:'json'}})",
            "vi.doMock(import('./dep'),()=>({value:1}))",
            "vi.doMock('./dep')",
            "vi.doUnmock('./dep',{})",
            "vi.doMock('./dep',()=>({value:import('./other')}))",
            "vi.doMock('./dep',()=>({value:1}));vi.mock('./other',()=>({value:2}))",
            "vi.doMock('./dep',()=>({value:1}));vi.hoisted(()=>({value:2}))",
            "vi.doMock('./dep',()=>({value:1}));vi.importActual('./other')",
            "const tool=vi;tool.doMock('./dep',()=>({value:1}));vi.doUnmock('./dep')",
            "const {doMock}=vi;doMock('./dep',()=>({value:1}))",
            "vi['doMock']('./dep',()=>({value:1}))",
        ] {
            assert!(
                extract_test_mocks(&format!("import {{vi}} from 'vitest';{body}"), "spec.mjs")
                    .is_err(),
                "accepted {body}"
            );
        }
    }

    #[test]
    fn retains_imported_test_api_bindings_for_factory_closures() {
        for (import, api) in [
            ("vi", "vi"),
            ("vi as tools", "tools"),
            ("vitest as tools", "tools"),
        ] {
            let source = format!(
                "import {{{import}}} from 'vitest';{api}.mock('./dep',async original=>({{...await \
                 original(),value:{api}.fn(()=>42)}}))"
            );
            let plan = extract_static_mocks(&source, "spec.mjs").unwrap();
            assert_eq!(plan.declarations.len(), 1);
            assert_eq!(plan.declarations[0].export_names, ["value"]);
            assert!(
                plan.declarations[0]
                    .factory_source
                    .contains(&format!("{api}.fn"))
            );
            assert_eq!(plan.api_bindings[0].1, api);
        }
        for source in [
            "import {vi} from 'vitest';import {other} from \
             './other';vi.mock('./dep',()=>({value:vi.fn(other)}))",
            "import {vi} from 'vitest';const \
             other=42;vi.mock('./dep',()=>({value:vi.fn(()=>other)}))",
        ] {
            assert!(extract_static_mocks(source, "spec.mjs").is_err());
        }
    }

    #[test]
    fn extracts_hoisted_namespaces_and_allows_only_verified_factory_captures() {
        let source = "import {vi} from 'vitest';import {value} from './dep';const \
                      injected=vi.hoisted(()=>({value:42}));vi.mock('./dep',()=>injected);";
        let plan = extract_static_mocks(source, "spec.mjs").unwrap();
        assert_eq!(plan.hoisted.len(), 1);
        assert_eq!(plan.hoisted[0].bindings, ["injected"]);
        assert_eq!(plan.declarations[0].export_names, ["value"]);
        assert!(plan.declarations[0].factory_source.contains("injected"));
        assert!(!plan.source.contains("vi.hoisted"));
        assert!(!plan.source.contains("vi.mock"));
        assert!(!plan.is_empty());
        assert!(
            extract_static_mocks(
                "import {vi} from 'vitest';const ordinary={value:42};vi.mock('./dep',()=>ordinary)",
                "spec.mjs"
            )
            .is_err()
        );
    }

    #[test]
    fn hoisted_spies_and_async_helpers_retain_the_original_declaration() {
        let source = "import {vi as v} from 'vitest';const {fn:spy}=await \
                      v.hoisted(async()=>({fn:v.fn()}));v.mock('./dep',()=>({value:spy}));";
        let plan = extract_static_mocks(source, "spec.ts").unwrap();
        assert_eq!(plan.hoisted[0].bindings, ["spy"]);
        assert!(
            plan.hoisted[0]
                .source
                .starts_with("const {fn:spy}=await v.hoisted")
        );
        assert_eq!(plan.api_bindings, [("vi".into(), "v".into())]);
        assert_eq!(plan.declarations[0].export_names, ["value"]);
    }

    #[test]
    fn compiles_literal_actual_loaders_without_mocks_and_preserves_utf16_columns() {
        let source = "import {vi} from 'vitest';const _a0=1;const actual=await \
                      vi.importActual('./é😀');const other=vi\n.importActual('./other');";
        let plan = extract_static_mocks(source, "spec.ts").unwrap();
        assert!(plan.declarations.is_empty());
        assert_eq!(plan.actual_imports.len(), 2);
        assert_eq!(plan.actual_imports[0].local, "_a1");
        assert_eq!(plan.actual_imports[1].local, "_a2");
        assert!(!plan.source.contains("importActual"));
        assert_eq!(
            source
                .split('\n')
                .map(|line| line.encode_utf16().count())
                .collect::<Vec<_>>(),
            plan.source
                .split('\n')
                .map(|line| line.encode_utf16().count())
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn verifies_actual_namespace_spreads_against_the_mocked_request() {
        let source = "import {vi} from 'vitest';vi.mock('./dep',async()=>{const actual=await \
                      vi.importActual('./dep');return {...actual,value:42}});";
        let plan = extract_static_mocks(source, "spec.ts").unwrap();
        assert!(plan.declarations[0].has_spread);
        assert!(plan.declarations[0].factory_source.contains("_a0"));
        assert!(
            plan.declarations[0]
                .original_factory_source
                .contains("vi.importActual")
        );
        assert!(
            extract_static_mocks(
                "import{vi}from'vitest';vi.mock('./dep',async()=>({...await \
                 vi.importActual('./other')}));",
                "spec.ts"
            )
            .is_err()
        );
    }

    #[test]
    fn hoisted_helpers_keep_tdz_and_reassignment_boundaries_explicit() {
        for body in [
            "const x=1;const h=vi.hoisted(()=>x);",
            "import {x} from './dep';const h=vi.hoisted(()=>x);",
            "const h=vi.hoisted(()=>vi.hoisted(()=>1));",
            "export const h=vi.hoisted(()=>1);",
            "const h=vi.hoisted(()=>1);function mutate(){h=2;}",
            "vi.importActual(name)",
            "vi.importActual('./dep',{})",
        ] {
            assert!(
                extract_static_mocks(&format!("import{{vi}}from'vitest';{body}"), "spec.ts")
                    .is_err(),
                "accepted {body}"
            );
        }
        assert!(
            extract_static_mocks(
                "import{vi}from'vitest';const state=vi.hoisted(()=>({value:1}));state.value=2;",
                "spec.ts"
            )
            .is_ok()
        );
    }

    #[test]
    fn distinguishes_empty_replacement_from_throw_only_factory() {
        let source = "import {vi} from \
                      'vitest';vi.mock('./empty',()=>({}));vi.mock('./throws',()=>{throw new \
                      Error('factory')});";
        let plan = extract_static_mocks(source, "spec.ts").unwrap();
        assert!(plan.declarations[0].has_object_return);
        assert!(plan.declarations[0].export_names.is_empty());
        assert!(!plan.declarations[1].has_object_return);
        assert!(plan.declarations[1].export_names.is_empty());
    }

    #[test]
    fn preserves_generic_api_values_in_unmocked_specs() {
        let source = "import {vi,vitest} from 'vitest';const \
                      tools=vi;tools.fn();if(vi!==vitest)throw new Error('identity');";
        let plan = extract_static_mocks(source, "spec.js").unwrap();
        assert!(plan.declarations.is_empty());
        assert_eq!(plan.source, source);
        assert!(
            extract_static_mocks(
                "import{vi}from'vitest';const tools=vi;vi.mock('./dep',()=>({value:1}));",
                "spec.js"
            )
            .is_err()
        );
    }

    #[test]
    fn rejects_bom_mock_specs_without_changing_unmocked_sources() {
        let source = "\u{feff}import {vi} from 'vitest';vi.mock('./dep',()=>({value:1}))";
        assert!(
            extract_static_mocks(source, "spec.ts")
                .err()
                .unwrap()
                .to_string()
                .contains("BOM-prefixed")
        );
        let plain = "\u{feff}export const value = 1";
        assert_eq!(
            extract_static_mocks(plain, "plain.ts").unwrap().source,
            plain
        );
    }

    #[test]
    fn accepts_typed_and_intrinsic_jsx_factories() {
        let typed = "import {vi} from 'vitest';vi.mock('./dep',()=>{const \
                     value:string='typed';return {value}})";
        assert_eq!(
            extract_static_mocks(typed, "spec.ts")
                .unwrap()
                .declarations
                .len(),
            1
        );
        let jsx = "import {vi} from 'vitest';vi.mock('./dep',()=>({value:<span>child</span>}))";
        assert_eq!(
            extract_static_mocks(jsx, "spec.jsx")
                .unwrap()
                .declarations
                .len(),
            1
        );
    }

    #[test]
    fn rejects_callback_rebinding_through_loops_and_declarations() {
        for body in [
            "for(original of [()=>({value:42,mockOnly:1})]){}",
            "for(original in {value:42,mockOnly:1}){}",
            "var original=()=>({value:42,mockOnly:1});",
            "var {x: original}={x:()=>({value:42,mockOnly:1})};",
            "function original(){return {value:42,mockOnly:1}}",
        ] {
            let source = format!(
                "import {{vi}} from 'vitest';vi.mock('./dep',async \
                 original=>{{{body}return{{...await original()}}}})"
            );
            let error = extract_static_mocks(&source, "spec.ts")
                .err()
                .expect("callback rebind must reject");
            assert!(
                error.to_string().contains("Reassigning the importOriginal"),
                "{body}: {error}"
            );
        }
    }

    #[test]
    fn ignores_type_only_api_references() {
        let plan = extract_static_mocks(
            "import{vi}from'vitest';type Tools=typeof vi;vi.mock('./dep',()=>({value:1}))",
            "spec.ts",
        )
        .unwrap();
        assert_eq!(plan.declarations.len(), 1);
    }

    #[test]
    fn rejects_unknown_spreads_and_extracted_module_context() {
        for body in [
            "vi.mock('./dep',()=>({...{value:42,mockOnly:1}}))",
            "vi.mock('./dep',async original=>{original=async()=>({mockOnly:1});return {...await \
             original()}})",
            "vi.mock('./dep',()=>({value:import.meta.url}))",
            "vi.mock('./dep',async original=>{let actual=await original();actual={extra:1};return \
             {...actual}})",
        ] {
            assert!(
                extract_static_mocks(&format!("import {{vi}} from 'vitest';{body}"), "spec.ts")
                    .is_err(),
                "accepted {body}"
            );
        }
    }

    #[test]
    fn rejects_client_and_server_directives_after_comments() {
        for source in [
            "/* comment */ 'use client'; export const value=1",
            "// comment\n'use strict'; 'use server'; export async function action() {}",
        ] {
            assert!(validate_mock_target_source(source, "target.ts").is_err());
        }
        assert!(
            validate_mock_target_source("export const value = 'use client'", "target.ts").is_ok()
        );
    }

    #[test]
    fn leaves_unmocked_javascript_jsx_unchanged() {
        let source =
            "import {test} from 'vitest'; const element = <div />; test('jsx', () => element);";
        let plan = extract_static_mocks(source, "spec.js").unwrap();
        assert_eq!(plan.source, source);
        assert!(plan.declarations.is_empty());
    }

    #[test]
    fn preserves_utf16_columns_after_unicode_call() {
        let source =
            "import {vi} from 'vitest'; vi.mock('./é😀', () => ({value: 1})); const after = 1;";
        let plan = extract_static_mocks(source, "spec.ts").unwrap();
        let original_column = source[..source.find("const after").unwrap()]
            .encode_utf16()
            .count();
        let stripped_column = plan.source[..plan.source.find("const after").unwrap()]
            .encode_utf16()
            .count();
        assert_eq!(original_column, stripped_column);
    }

    #[test]
    fn extracts_ordered_alias_factories_and_preserves_lines() {
        let source = "import { vi as v } from 'vitest';\nimport { value } from \
                      './subject';\nv.mock('./dep', async (original) => ({ ...(await original()), \
                      value: 'mock' }));\nv.mock('./other', () => ({ default: 42 }));\n";
        let plan = extract_static_mocks(source, "spec.ts").unwrap();
        assert_eq!(plan.declarations.len(), 2);
        assert_eq!(plan.declarations[0].request, "./dep");
        assert_eq!(plan.declarations[0].export_names, ["value"]);
        assert!(plan.declarations[0].has_spread);
        assert_eq!(plan.declarations[1].export_names, ["default"]);
        assert_eq!(plan.source.lines().count(), source.lines().count());
        assert!(plan.source.contains("import { value }"));
        assert!(!plan.source.contains("v.mock"));
        assert_eq!(&source[plan.declarations[0].factory_start..][..6], "async ");
    }

    #[test]
    fn accepts_type_safe_literal_import_targets() {
        let source = "import {vi} from 'vitest';vi.mock(import('./dep'), async (original) => ({ \
                      ...(await original()), value: 'mock' }));";
        let plan = extract_static_mocks(source, "spec.ts").unwrap();
        assert_eq!(plan.declarations.len(), 1);
        assert_eq!(plan.declarations[0].request, "./dep");
        assert_eq!(plan.declarations[0].export_names, ["value"]);
        assert!(plan.declarations[0].has_spread);
        assert!(!plan.source.contains("vi.mock"));
    }

    #[test]
    fn extracts_literal_automatic_mocks_without_evaluating_import_targets() {
        for target in [
            "'./dep'",
            "import('./dep')",
            "'./dep', undefined",
            "'./dep', {}",
            "'./dep', {spy:false}",
        ] {
            let source = format!("import{{vi as v}}from'vitest';v.mock({target});const after=1;");
            let plan = extract_static_mocks(&source, "spec.ts").unwrap();
            assert_eq!(plan.declarations.len(), 1);
            let declaration = &plan.declarations[0];
            assert!(declaration.automatic);
            assert!(!declaration.spy);
            assert_eq!(declaration.request, "./dep");
            assert!(!declaration.has_spread);
            assert!(!declaration.has_object_return);
            assert!(declaration.export_names.is_empty());
            assert!(declaration.factory_source.is_empty());
            assert!(!plan.source.contains("v.mock"));
            assert!(plan.source.contains("const after=1"));
            assert_eq!(
                source.encode_utf16().count(),
                plan.source.encode_utf16().count()
            );
        }
    }

    #[test]
    fn manual_sources_keep_esm_code_and_ordinary_assertion_utilities() {
        for source in [
            "await Promise.resolve();export let count=0;export function inc(){count++}",
            "import{vi}from'vitest';export const fn=vi.fn(()=>42);export default fn;",
        ] {
            super::validate_manual_mock_source(source, "__mocks__/dep.mjs").unwrap();
        }
    }

    #[test]
    fn manual_sources_reject_untransformed_compiler_helpers_and_framework_boundaries() {
        for source in [
            "import{vi}from'vitest';export const actual=await vi.importActual('../dep')",
            "import{vi}from'vitest';const state=vi.hoisted(()=>({value:1}));export{state}",
            "import{vi}from'vitest';vi.mock('../dep',()=>({value:1}));export const value=1",
            "/* header */ 'use client';export const value=1",
            "/* header */ 'use server';export const value=1",
        ] {
            assert!(super::validate_manual_mock_source(source, "__mocks__/dep.mjs").is_err());
        }
    }

    #[test]
    fn hoisted_import_order_metadata_uses_syntax_not_source_text() {
        let plan = extract_static_mocks(
            "import{vi}from'vitest';const first=vi.hoisted(()=>\"import('./dep')\");const \
             second=vi.hoisted(async()=>import('./dep'));",
            "spec.mjs",
        )
        .unwrap();
        assert!(!plan.hoisted[0].has_dynamic_import);
        assert!(plan.hoisted[1].has_dynamic_import);
    }

    #[test]
    fn extracts_literal_spy_options_without_capturing_runtime_values() {
        for options in ["{spy:true}", "{'spy':true}", "({spy:true} as const)"] {
            let source = format!("import{{vi}}from'vitest';vi.mock('./dep',{options});");
            let plan = extract_static_mocks(&source, "spec.ts")
                .unwrap_or_else(|error| panic!("{options}: {error}"));
            let declaration = &plan.declarations[0];
            assert!(declaration.automatic);
            assert!(declaration.spy);
            assert_eq!(declaration.request, "./dep");
            assert!(declaration.export_names.is_empty());
            assert!(!plan.source.contains("vi.mock"));
            assert_eq!(
                source.encode_utf16().count(),
                plan.source.encode_utf16().count()
            );
        }
    }

    #[test]
    fn rejects_unsupported_forms_and_outer_captures() {
        for body in [
            "vi.mock();",
            "vi.mock(name);",
            "vi.mock(...['./dep']);",
            "vi.mock('./dep', () => ({}), {});",
            "vi.mock(name, () => ({ value: 1 }));",
            "vi.mock(import(name), () => ({ value: 1 }));",
            "vi.mock(import('./dep', { with: { type: 'json' } }), () => ({ value: 1 }));",
            "vi.mock('./dep?raw', () => ({ value: 1 }));",
            "vi.mock('./é#fragment', () => ({ value: 1 }));",
            "vi.mock('./dep', { other: false });",
            "vi.mock('./dep', { spy: enabled });",
            "vi.mock('./dep', { get spy() { return true } });",
            "vi.mock('./dep', { ...{} });",
            "const undefined=()=>({value:1});vi.mock('./dep', undefined);",
            "function later() { vi.mock('./dep', () => ({ value: 1 })); }",
            "const value = 1; vi.mock('./dep', () => ({ value }));",
            "vi.mock('./dep', async () => ({ value: await import('./other') }));",
            "vi.mock('./dep', () => ({ [globalThis.key]: 1 }));",
            "vi.doMock('./dep', () => ({ value: 1 }));",
            "const mock = vi.mock; mock('./dep', () => ({ value: 1 }));",
            "const {mock} = vi; mock('./dep', () => ({value: 1}));",
            "const {mock: alias} = vi; alias('./dep', () => ({value: 1}));",
        ] {
            assert!(
                extract_static_mocks(&format!("import {{vi}} from 'vitest';{body}"), "spec.ts")
                    .is_err(),
                "accepted {body}"
            );
        }
    }

    #[test]
    fn preserves_reset_only_source_without_extraction_or_hoisting() {
        let source = "import { test, expect, vi } from 'vitest';\ntest('fresh', async () => { \
                      const first = await import('./subject.mjs'); expect(first.next()).toBe(1); \
                      vi.resetModules(); const second = await import('./subject.mjs'); \
                      expect(second.next()).toBe(1); expect(first).not.toBe(second); });";
        let plan = extract_static_mocks(source, "contract.case.mjs").unwrap();
        assert!(plan.reset_modules);
        assert!(!plan.is_empty());
        assert_eq!(plan.source.as_bytes(), source.as_bytes());
        assert!(
            plan.declarations.is_empty()
                && plan.hoisted.is_empty()
                && plan.actual_imports.is_empty()
        );
        let source = "import { vi as tools } from 'vitest'; tools.resetModules(); function \
                      other(vi) { vi.doMock('./foreign', () => ({})); }";
        let plan = extract_static_mocks(source, "spec.mjs").unwrap();
        assert!(plan.reset_modules);
        assert_eq!(plan.source, source);
        let body = "const reset = vi.resetModules; reset()";
        let source = format!("import {{vi}} from 'vitest';{body}");
        let plan = extract_static_mocks(&source, "spec.mjs").unwrap();
        assert!(plan.reset_modules);
        assert_eq!(plan.source.as_bytes(), source.as_bytes());
        assert!(
            plan.declarations.is_empty()
                && plan.hoisted.is_empty()
                && plan.actual_imports.is_empty()
                && plan.mock_imports.is_empty()
                && plan.unmocks.is_empty()
                && plan.runtime_requests.is_empty()
        );
    }

    #[test]
    fn retains_literal_reset_member_references_as_real_cache_demand() {
        for source in [
            "import {vi} from 'vitest';const reset = vi.resetModules; reset()",
            "import {vi} from 'vitest';const reset=vi.resetModules;test('fresh',()=>reset())",
            "import {vitest as tools} from 'vitest';const reset=tools.resetModules;reset()",
            "import {vi} from 'vitest';const reset=vi.resetModules;vi.resetModules();reset()",
        ] {
            for extract in [extract_static_mocks, extract_test_mocks] {
                let plan = extract(source, "reset-reference.mjs").unwrap();
                assert!(plan.reset_modules);
                assert!(!plan.is_empty());
                assert!(plan.declarations.is_empty());
                assert!(plan.hoisted.is_empty());
                assert!(plan.actual_imports.is_empty());
                assert!(plan.mock_imports.is_empty());
                assert!(plan.unmocks.is_empty());
                assert!(plan.runtime_requests.is_empty());
                assert_eq!(plan.source.as_bytes(), source.as_bytes());
            }
        }
        let source = "import {vi} from 'vitest';function foreign(vi){return vi.resetModules}";
        let plan = extract_test_mocks(source, "shadowed.mjs").unwrap();
        assert!(plan.is_empty());
        assert!(!plan.reset_modules);
    }

    #[test]
    fn reset_member_references_do_not_certify_calls_aliases_or_mock_combinations() {
        for body in [
            "const reset=vi.resetModules;vi.resetModules('unused')",
            "const reset=vi.resetModules;consume(vi)",
            "const reset=vi.resetModules;const api=vi",
            "const reset=vi.resetModules;const mock=vi.mock",
            "const reset=vi.resetModules;vi.mock('./dep',()=>({value:1}))",
            "const reset=vi.resetModules;vi.hoisted(()=>({value:1}))",
            "const reset=vi.resetModules;vi.importActual('./dep')",
            "const reset=vi.resetModules;vi.doMock('package',()=>({value:1}))",
            "const reset=vi.resetModules;Object.getOwnPropertyDescriptor(vi,'resetModules')",
        ] {
            let source = format!("import {{vi}} from 'vitest';{body}");
            assert!(extract_test_mocks(&source, "reset-reference-negative.mjs").is_err());
        }
    }

    #[test]
    fn rejects_reset_aliases_arguments_and_unqualified_mock_combinations() {
        for body in [
            "vi.resetModules('unused')",
            "vi['resetModules']()",
            "const {resetModules} = vi; resetModules()",
            "const tools = vi; tools.resetModules(); vi.resetModules()",
            "vi.resetModules(); vi.mock('./dep', () => ({value: 1}))",
            "vi.resetModules(); vi.hoisted(() => ({value: 1}))",
            "vi.resetModules(); await vi.importActual('./dep')",
            "vi.doMock('./dep', () => ({value: 1})); vi.resetModules()",
            "vi.doUnmock('./dep'); vi.resetModules()",
        ] {
            assert!(
                extract_static_mocks(&format!("import {{vi}} from 'vitest';{body}"), "spec.mjs")
                    .is_err(),
                "accepted {body}"
            );
        }
    }

    #[test]
    fn retains_actual_reset_as_a_compiler_candidate_only() {
        let source =
            "import {vi} from 'vitest';vi.resetModules();await vi.importActual('./root.cjs')";
        assert!(extract_static_mocks(source, "spec.mjs").is_err());
        let plan = extract_test_mocks(source, "spec.mjs").unwrap();
        assert!(plan.reset_modules);
        assert_eq!(plan.actual_imports.len(), 1);
        assert_eq!(plan.actual_imports[0].request, "./root.cjs");
        assert!(plan.source.contains("_a0"));
        assert!(!plan.source.contains("vi.importActual"));
        assert_eq!(plan.source.len(), source.len());
        for request in ["./root.cjs?raw", "./root.cjs#part"] {
            let error = extract_test_mocks(&source.replace("./root.cjs", request), "spec.mjs")
                .err()
                .unwrap();
            assert!(error.to_string().contains("query strings or fragments"));
        }
        for operation in [
            "vi.mock('./dep',()=>({value:1}))",
            "vi.hoisted(()=>({value:1}))",
            "vi.importMock('./dep')",
            "vi.unmock('./dep')",
            "vi.doMock('./dep',()=>({value:1}))",
            "vi.doUnmock('./dep')",
        ] {
            assert!(extract_test_mocks(&format!("{source};{operation}"), "spec.mjs").is_err());
        }
    }

    #[test]
    fn allows_factory_locals_and_respects_shadowing() {
        let plan = extract_static_mocks(
            "import { vi } from 'vitest'; vi.mock('./dep', async (original) => { const actual = \
             await original(); const value: number = 2; return { ...actual, value }; }); function \
             other(vi) { vi.mock('unrelated'); }",
            "spec.ts",
        )
        .unwrap();
        assert_eq!(plan.declarations.len(), 1);
        assert!(plan.source.contains("vi.mock('unrelated')"));
    }
    #[test]
    fn cjs_spy_consumers_reject_loaders_before_dead_code_removal() {
        use crate::testing_mock_source::validate_cjs_spy_entry_source;
        for source in [
            "if(false) import('./implementation.cjs')",
            "if(false) require('./implementation.cjs')",
            "if(false) module.require('./implementation.cjs')",
            "const r = require; r('./implementation.cjs')",
            "import {createRequire as make} from 'node:module'; \
             make(import.meta.url)('./implementation.cjs')",
            "process.getBuiltinModule('module')",
            "globalThis['require']('./implementation.cjs')",
            "eval('require(\"./implementation.cjs\")')",
            "new Function('return 1')",
        ] {
            assert!(
                validate_cjs_spy_entry_source(source, "entry.mjs").is_err(),
                "{source}"
            );
        }
        assert!(
            validate_cjs_spy_entry_source(
                "import { arbitrary as alias } from \
                 './implementation.cjs';test('case',()=>alias())",
                "entry.mjs"
            )
            .is_ok()
        );
        assert!(
            validate_cjs_spy_entry_source(
                "const text='require ./implementation.cjs'; // import('./implementation.cjs')",
                "entry.mjs"
            )
            .is_ok()
        );
    }
}

#[cfg(test)]
mod import_mock_unmock_tests {
    use super::*;

    #[test]
    fn excludes_escaped_authored_identifiers_from_import_mock_helper_names() {
        let source = r"import{vi}from'vitest';const \u005fm0=1;vi.importMock('./dep');";
        let plan = extract_test_mocks(source, "entry.mjs").unwrap();
        assert_eq!(plan.mock_imports[0].local, "_m1");
        assert!(plan.source.contains(r"const \u005fm0=1"));
    }

    #[test]
    fn extracts_import_mock_callees_without_rewriting_requests_or_utf16_positions() {
        let source = "import{vi as v}from'vitest';const _m0=1;const note='é😀';const \
                      first=v.importMock('./dep');const second=v\n.importMock('./dep');";
        let plan = extract_test_mocks(source, "entry.mjs").unwrap();
        assert_eq!(plan.mock_imports.len(), 2);
        assert_eq!(plan.mock_imports[0].request, "./dep");
        assert_eq!(plan.mock_imports[0].local, "_m1");
        assert_eq!(plan.mock_imports[1].local, "_m2");
        assert_eq!(
            plan.source.encode_utf16().count(),
            source.encode_utf16().count()
        );
        assert_eq!(
            plan.source.matches('\n').count(),
            source.matches('\n').count()
        );
        assert!(!plan.source.contains("importMock"));
        assert!(plan.source.contains("('./dep')"));
        assert!(!plan.is_empty());
    }

    #[test]
    fn retains_unmock_source_order_and_masks_literal_import_arguments() {
        let source = "import{vi}from'vitest';vi.mock('./dep',()=>({value:1}));vi.unmock(import('./\
                      dep'));vi.unmock('./other');vi.mock('./other',()=>({value:2}));";
        let plan = extract_test_mocks(source, "entry.mjs").unwrap();
        assert_eq!(plan.declarations.len(), 2);
        assert_eq!(plan.unmocks.len(), 2);
        assert!(plan.declarations[0].factory_start < plan.unmocks[0].start);
        assert!(plan.unmocks[1].start < plan.declarations[1].factory_start);
        assert_eq!(plan.unmocks[0].request, "./dep");
        assert_eq!(plan.unmocks[1].request, "./other");
        assert!(!plan.source.contains("unmock"));
        assert!(!plan.source.contains("import('./dep')"));
        assert!(!plan.is_empty());
    }

    #[test]
    fn rejects_module_helpers_through_direct_aliases_and_preserves_ordinary_aliases() {
        for api in ["vi", "vitest as tools"] {
            let local = if api == "vi" { "vi" } else { "tools" };
            for helper in [
                "mock",
                "doMock",
                "unmock",
                "doUnmock",
                "hoisted",
                "importActual",
                "importMock",
                "resetModules",
            ] {
                for access in [format!("alias.{helper}"), format!("alias['{helper}']")] {
                    let source = format!(
                        "import{{{api}}}from'vitest';const alias={local};{access}('./dep')"
                    );
                    assert!(
                        extract_test_mocks(&source, "entry.mjs").is_err(),
                        "{source}"
                    );
                }
            }
        }
        for statement in [
            "const alias=vi;alias.fn()",
            "const alias=vi;alias['fn']()",
            "const alias=vi;alias.spyOn(object,'method')",
            "const alias=vi;{const alias={unmock(){}};alias.unmock('./dep')}",
            "const alias=vi;function nested(alias){alias.unmock('./dep')}",
            "const alias={unmock(){}};alias.unmock('./dep')",
        ] {
            let source = format!("import{{vi}}from'vitest';{statement}");
            let plan = extract_test_mocks(&source, "entry.mjs").unwrap();
            assert!(plan.is_empty(), "{statement}");
            assert_eq!(plan.source, source);
        }
    }

    #[test]
    fn rejects_unsupported_new_helper_shapes_before_planning() {
        for statement in [
            "vi.importMock(name)",
            "vi.importMock('./dep',{})",
            "vi.importMock('./dep?x')",
            "vi.unmock(name)",
            "vi.unmock(import(name))",
            "vi.unmock('./dep',{})",
            "function nested(){vi.unmock('./dep')}",
            "const {importMock}=vi;importMock('./dep')",
            "vi['unmock']('./dep')",
            "const alias=vi;alias.unmock('./dep')",
            "vi.resetModules();vi.importMock('./dep')",
            "vi.doUnmock('./dep');vi.unmock('./dep')",
            "vi.hoisted(async()=>{await import('./dep')});vi.unmock('./dep')",
            "vi.hoisted(async()=>vi.importMock('./dep'))",
            "vi.mock('./dep',async()=>({value:await vi.importMock('./other')}))",
        ] {
            let source = format!("import{{vi}}from'vitest';{statement}");
            assert!(
                extract_test_mocks(&source, "entry.mjs").is_err(),
                "{statement}"
            );
        }
    }
    #[test]
    fn runtime_namespace_order_retains_declarations_aliases_and_type_erasure() {
        let source = "export const z=1,a=2;const local=3;export {local as other};export function \
                      fn(){};export class Thing{};export default local;export {value as \
                      forwarded} from './peer';export * as namespace from './peer';export type \
                      {Type} from './peer';export interface Interface{}";
        assert_eq!(
            crate::testing_mock_source::runtime_namespace_exports(source, "module.ts").unwrap(),
            [
                "z",
                "a",
                "other",
                "fn",
                "Thing",
                "default",
                "forwarded",
                "namespace"
            ]
        );
    }

    #[test]
    fn optional_namespace_order_preserves_strict_diagnostics_and_operational_errors() {
        use crate::testing_mock_source::{
            runtime_namespace_exports, runtime_namespace_exports_candidate,
        };
        for (source, reason) in [
            (
                "const ordinary=1",
                "Runtime namespace construction requires an actual ESM source",
            ),
            (
                "export const {value}=source",
                "Runtime namespace destructured exports are not qualified",
            ),
            (
                "export enum Value { One }",
                "Runtime namespace declaration form is not qualified",
            ),
            (
                "export * from './peer'",
                "Runtime namespace star exports are not qualified",
            ),
            (
                "export = value",
                "Runtime namespace module form is not qualified",
            ),
            (
                "const value=1;export {value as same,value as same}",
                "Runtime namespace export order must be unique",
            ),
        ] {
            assert_eq!(
                runtime_namespace_exports(source, "module.ts")
                    .unwrap_err()
                    .to_string(),
                reason,
                "{source}"
            );
            assert!(
                runtime_namespace_exports_candidate(source, "module.ts")
                    .unwrap()
                    .is_none(),
                "{source}"
            );
        }
        for source in [
            "export const z=1,a=2;export {z as default}",
            "export {};export type {Value} from './peer'",
            "export function read(){};export class Thing{}",
        ] {
            assert_eq!(
                runtime_namespace_exports_candidate(source, "module.ts").unwrap(),
                Some(runtime_namespace_exports(source, "module.ts").unwrap()),
                "{source}"
            );
        }
        assert!(runtime_namespace_exports_candidate("export const =", "module.ts").is_err());
    }

    #[test]
    fn runtime_namespace_order_refuses_ambiguous_or_unqualified_forms() {
        for source in [
            "export * from './peer'",
            "export const {value}=source",
            "export = value",
            "export enum Value { One }",
        ] {
            assert!(
                crate::testing_mock_source::runtime_namespace_exports(source, "module.ts").is_err(),
                "{source}"
            );
        }
    }
    #[test]
    fn admits_only_nested_ordinary_callable_this_without_rewriting_factory() {
        for factory in [
            "()=>({fn(){return this.value}})",
            "()=>({fn:function(){return this.value}})",
            "()=>{function read(){return this.value}return {fn:read}}",
            "function(){return {fn(){return this.value}}}",
            "()=>({fn(value=this.value){return (()=>[this.value,value])()}})",
            "()=>({['fn'](){return this.value}})",
            "()=>({fn(){return class { [(this,'key')](){return 1} }}})",
        ] {
            let source = format!("import{{vi}}from'vitest';vi.mock('./dep',{factory});");
            let plan = extract_static_mocks(&source, "spec.ts")
                .unwrap_or_else(|error| panic!("{factory}: {error}"));
            assert_eq!(plan.declarations.len(), 1, "{factory}");
            assert_eq!(plan.declarations[0].factory_source, factory);
            assert_eq!(plan.declarations[0].original_factory_source, factory);
        }
    }

    #[test]
    fn retains_literal_computed_method_names_without_accepting_dynamic_or_data_keys() {
        for factory in [
            "()=>({['fn'](){return 1}})",
            "()=>({['fn'](){return this.value}})",
        ] {
            let source = format!("import{{vi}}from'vitest';vi.mock('./dep',{factory});");
            let plan = extract_static_mocks(&source, "spec.ts").unwrap();
            assert_eq!(plan.declarations[0].export_names, ["fn"]);
            assert_eq!(plan.declarations[0].original_factory_source, factory);
        }
        for factory in [
            "()=>({['fn']:1})",
            "()=>({[1](){return 1}})",
            "()=>({[('f'+'n')](){return 1}})",
        ] {
            let source = format!("import{{vi}}from'vitest';vi.mock('./dep',{factory});");
            assert!(
                extract_static_mocks(&source, "spec.ts").is_err(),
                "{factory}"
            );
        }
    }

    #[test]
    fn keeps_root_factory_arrow_and_class_this_refusals() {
        for factory in [
            "()=>({value:this})",
            "function(){return {value:this}}",
            "()=>({fn:()=>this})",
            "(value=this)=>({value})",
            "()=>({[(this,'fn')](){return 1}})",
            "()=>({value:class { field=this }})",
            "()=>({value:class { constructor(){this.value=1} }})",
            "()=>({value:class { static {this.value=1} }})",
            "()=>({fn(){return class {field=this}}})",
            "()=>({fn(){return class {constructor(){this.value=1}}}})",
            "()=>({fn(){return class {static {this.value=1}}}})",
            "()=>({fn(){return class {method(){return this}}}})",
        ] {
            let source = format!("import{{vi}}from'vitest';vi.mock('./dep',{factory});");
            let error = extract_static_mocks(&source, "spec.ts").err().unwrap();
            assert!(
                error.to_string().contains("this capture is unsupported"),
                "{factory}: {error}"
            );
        }
        assert!(
            extract_static_mocks(
                "import{vi}from'vitest';const state=vi.hoisted(()=>({fn(){return this}}));",
                "spec.ts"
            )
            .is_err()
        );
    }

    #[test]
    fn nested_callable_this_never_skips_existing_capture_and_meta_analysis() {
        for body in [
            "const secret=1;vi.mock('./dep',()=>({fn(){return secret+this.value}}));",
            "import{secret}from'./secret';vi.mock('./dep',()=>({fn:function(){return \
             [this,secret]}}));",
            "vi.mock('./dep',()=>({fn(){return [this,import('./secret')]}}));",
            "vi.mock('./dep',()=>({fn(){return [this,import.meta.url]}}));",
            "vi.mock('./dep',()=>({fn:function(){return [this,new.target]}}));",
        ] {
            let source = format!("import{{vi}}from'vitest';{body}");
            assert!(
                extract_static_mocks(&source, "spec.ts").is_err(),
                "accepted {body}"
            );
        }
    }
    #[test]
    fn retains_only_single_literal_unmock_before_native_pair() {
        for factory in ["()=>({value:5})", "()=>({value:5,fn(){return this.value}})"] {
            let source = format!(
                "import{{vi}}from'vitest';vi.unmock('package');vi.mock('package',{factory});vi.\
                 doMock('package',()=>({{value:73}}));vi.importActual('package');vi.\
                 resetModules();vi.doUnmock('package');"
            );
            let plan = extract_test_mocks(&source, "spec.mjs").unwrap();
            assert_eq!(plan.retained_single_native_unmock(), Some("package"));
            assert_eq!(plan.unmocks.len(), 1);
            assert_eq!(plan.declarations.len(), 1);
            assert_eq!(plan.declarations[0].factory_source, factory);
            assert!(plan.unmocks[0].start < plan.declarations[0].factory_start);
            assert!(plan.source.contains("vi.resetModules()"));
            assert!(!plan.source.contains("vi.unmock("));
            assert!(extract_static_mocks(&source, "spec.mjs").is_err());
        }
    }

    #[test]
    fn keeps_after_cut_alias_and_multi_target_native_mixtures_closed() {
        for body in [
            "vi.unmock('alias');vi.mock('package',()=>({value:5}));vi.doMock('package',\
             ()=>({value:73}));vi.importActual('package');vi.resetModules();",
            "vi.unmock('package');vi.mock('package',()=>({value:5}));vi.mock('other',()=>({value:\
             5}));vi.doMock('package',()=>({value:73}));vi.doMock('other',()=>({value:73}));vi.\
             importActual('package');vi.resetModules();",
            "vi.unmock(import('package'));vi.mock('package',()=>({value:5}));vi.doMock('package',\
             ()=>({value:73}));vi.importActual('package');vi.resetModules();",
            "vi.unmock('./dep');vi.mock('./dep',()=>({value:5}));vi.doMock('./dep',()=>({value:\
             73}));vi.importActual('./dep');vi.resetModules();",
            "vi.unmock('package');vi.mock('package',()=>({value:5}));vi.doMock('package',\
             ()=>({value:73}));vi.importActual('other');vi.resetModules();",
            "vi.unmock('package');vi.mock('package',()=>({value:5}));vi.doMock('other',\
             ()=>({value:73}));vi.importActual('package');vi.resetModules();",
            "vi.unmock('package');vi.mock('package',()=>({value:5}));vi.doMock('package',\
             ()=>({value:73}));vi.importActual('package');",
            "vi.unmock('package');vi.mock('package',()=>({value:5}));vi.doMock('package',\
             ()=>({value:73}));vi.resetModules();",
            "vi.unmock('package');vi.mock('package',()=>({value:5}));vi.doMock('package',\
             ()=>({value:73}));vi.importActual('package');vi.importMock('package');vi.\
             resetModules();",
            "vi.unmock('package');vi.mock('package',()=>({value:5}));vi.doMock('package',\
             ()=>({value:73}));vi.importActual('package');vi.hoisted(()=>1);vi.resetModules();",
            "vi.unmock('package');vi.mock('package',()=>({value:5}));vi.doUnmock('package');vi.\
             importActual('package');vi.resetModules();",
        ] {
            let source = format!("import{{vi}}from'vitest';{body}");
            assert!(
                extract_test_mocks(&source, "spec.mjs").is_err(),
                "accepted {body}"
            );
        }
    }
    #[test]
    fn cancels_only_one_later_top_level_native_factory() {
        for factory in ["()=>({value:5})", "function(){return {value:5}}"] {
            let source = format!(
                "import{{vi}}from'vitest';vi.mock('package',{factory});vi.unmock('package');vi.\
                 doMock('package',()=>({{value:73}}));vi.importActual('package');vi.\
                 resetModules();"
            );
            let plan = extract_test_mocks(&source, "spec.mjs").unwrap();
            assert_eq!(plan.cancelled_single_native_unmock(), Some("package"));
            assert_eq!(plan.retained_single_native_unmock(), None);
            assert_eq!(plan.declarations[0].original_factory_source, factory);
            assert!(plan.unmocks[0].start >= plan.declarations[0].factory_start + factory.len());
            assert!(!plan.source.contains("vi.mock("));
            assert!(!plan.source.contains("vi.unmock("));
            assert!(plan.source.contains("vi.resetModules()"));
            for change in 0..6 {
                let mut altered = extract_test_mocks(&source, "spec.mjs").unwrap();
                match change {
                    0 => altered.unmocks[0].end = altered.unmocks[0].start,
                    1 => altered.unmocks[0].start = altered.declarations[0].factory_start,
                    2 => altered.actual_imports[0].request = "other".into(),
                    3 => altered.runtime_requests.push("other".into()),
                    4 => altered.reset_modules = false,
                    5 => altered.declarations[0].has_spread = true,
                    _ => unreachable!(),
                }
                assert_eq!(altered.cancelled_single_native_unmock(), None, "{change}");
            }
        }
        for tail in [
            "if(true){vi.unmock('package')}",
            "function later(){vi.unmock('package')}",
            "vi.unmock('alias')",
            "vi.unmock(import('package'))",
        ] {
            let source = format!(
                "import{{vi}}from'vitest';vi.mock('package',()=>({{value:5}}));{tail};vi.doMock('\
                 package',()=>({{value:73}}));vi.importActual('package');vi.resetModules();"
            );
            assert!(extract_test_mocks(&source, "spec.mjs").is_err(), "{tail}");
        }
    }
    #[test]
    fn retains_the_last_ordered_literal_cut_for_one_native_factory() {
        for (body, retained) in [
            (
                "vi.unmock('package');vi.unmock('package');vi.mock('package',()=>({value:5}));vi.\
                 doMock('package',()=>({value:73}));vi.importActual('package');vi.resetModules();",
                true,
            ),
            (
                "vi.unmock('package');vi.mock('package',()=>({value:5}));vi.unmock('package');vi.\
                 doMock('package',()=>({value:73}));vi.importActual('package');vi.resetModules();",
                false,
            ),
        ] {
            let source = format!("import{{vi}}from'vitest';{body}");
            let plan = extract_test_mocks(&source, "spec.mjs").unwrap();
            assert_eq!(plan.unmocks.len(), 2);
            assert_eq!(plan.declarations.len(), 1);
            assert_eq!(plan.declarations[0].factory_source, "()=>({value:5})");
            assert_eq!(
                plan.retained_single_native_unmock(),
                retained.then_some("package")
            );
            assert_eq!(
                plan.cancelled_single_native_unmock(),
                (!retained).then_some("package")
            );
            assert!(!plan.source.contains("vi.unmock("));
            assert!(plan.source.contains("vi.resetModules()"));
            assert!(extract_static_mocks(&source, "spec.mjs").is_err());
        }
    }

    #[test]
    fn rejects_incoherent_first_cut_even_when_the_last_cut_is_valid() {
        let source = "import{vi}from'vitest';vi.unmock('package');vi.unmock('package');vi.mock('\
                      package',()=>({value:5}));vi.doMock('package',()=>({value:73}));vi.\
                      importActual('package');vi.resetModules();";
        for change in 0..6 {
            let mut plan = extract_test_mocks(source, "spec.mjs").unwrap();
            match change {
                0 => plan.unmocks[0].request = "other".into(),
                1 => plan.unmocks[0].end = plan.unmocks[0].start,
                2 => plan.unmocks.swap(0, 1),
                3 => plan.unmocks[0].end = plan.unmocks[1].start + 1,
                4 => plan.unmocks[0].end = plan.declarations[0].factory_start + 1,
                5 => plan.reset_modules = false,
                _ => unreachable!(),
            }
            assert_eq!(plan.retained_single_native_unmock(), None, "{change}");
            assert_eq!(plan.cancelled_single_native_unmock(), None, "{change}");
        }
    }

    #[test]
    fn retains_source_ordered_factories_for_one_native_cut_target() {
        for (body, retained) in [
            (
                "vi.unmock('package');vi.mock('package',()=>({value:5}));vi.mock('package',\
                 ()=>({value:9}));",
                true,
            ),
            (
                "vi.mock('package',()=>({value:5}));vi.unmock('package');vi.mock('package',\
                 ()=>({value:9}));",
                true,
            ),
            (
                "vi.mock('package',()=>({value:5}));vi.mock('package',()=>({value:9}));vi.unmock('\
                 package');",
                false,
            ),
        ] {
            let source = format!(
                "import{{vi}}from'vitest';{body}vi.doMock('package',()=>({{value:73}}));vi.\
                 importActual('package');vi.resetModules();vi.doUnmock('package');"
            );
            let plan = extract_test_mocks(&source, "spec.mjs").unwrap();
            assert_eq!(plan.declarations.len(), 2);
            assert_eq!(plan.unmocks.len(), 1);
            assert_eq!(
                plan.declarations[0].original_factory_source,
                "()=>({value:5})"
            );
            assert_eq!(
                plan.declarations[1].original_factory_source,
                "()=>({value:9})"
            );
            assert_eq!(
                plan.retained_single_native_unmock(),
                retained.then_some("package")
            );
            assert_eq!(
                plan.cancelled_single_native_unmock(),
                (!retained).then_some("package")
            );
            assert!(!plan.source.contains("vi.mock("));
            assert!(!plan.source.contains("vi.unmock("));
            assert!(plan.source.contains("vi.resetModules()"));
            assert!(extract_static_mocks(&source, "spec.mjs").is_err());
        }
    }

    #[test]
    fn checks_every_factory_range_in_native_cut_candidates() {
        let source = "import{vi}from'vitest';vi.unmock('package');vi.mock('package',()=>({value:\
                      5}));vi.mock('package',()=>({value:9}));vi.doMock('package',()=>({value:\
                      73}));vi.importActual('package');vi.resetModules();";
        for change in 0..5 {
            let mut plan = extract_test_mocks(source, "spec.mjs").unwrap();
            match change {
                0 => plan.declarations[0].request = "other".into(),
                1 => plan.declarations[0].has_spread = true,
                2 => plan.declarations.swap(0, 1),
                3 => plan.unmocks[0].end = plan.declarations[0].factory_start + 1,
                4 => plan.declarations[0].factory_start = usize::MAX,
                _ => unreachable!(),
            }
            assert_eq!(plan.retained_single_native_unmock(), None, "{change}");
            assert_eq!(plan.cancelled_single_native_unmock(), None, "{change}");
        }
    }
}

#[cfg(test)]
mod native_multi_target_cut_tests {
    use std::collections::HashMap;

    use super::{
        NativeUnmockTarget, extract_static_mocks, extract_test_mocks,
        native_unmock_original_is_available,
    };

    #[test]
    fn retains_each_genuine_literal_group_without_promoting_static_only_extraction() {
        for (source, a_retained, a_count, b_retained, b_count) in [
            (
                include_str!("../tests/fixtures/native-multi-target/both-survive-interleaved.mjs"),
                true,
                2,
                true,
                1,
            ),
            (
                include_str!("../tests/fixtures/native-multi-target/a-cancelled-b-survives.mjs"),
                false,
                0,
                true,
                1,
            ),
            (
                include_str!("../tests/fixtures/native-multi-target/a-survives-b-cancelled.mjs"),
                true,
                2,
                false,
                0,
            ),
            (
                include_str!(
                    "../tests/fixtures/native-multi-target/both-cancelled-interleaved.mjs"
                ),
                false,
                0,
                false,
                0,
            ),
            (
                include_str!("../tests/fixtures/native-multi-target/mirror-before-between.mjs"),
                true,
                1,
                true,
                2,
            ),
        ] {
            let plan = extract_test_mocks(source, "entry.mjs").unwrap();
            let targets = plan.native_unmock_targets().unwrap();
            assert_eq!(targets.len(), 2);
            for (request, retained, count) in [
                ("next-test-native-cuts-a", a_retained, a_count),
                ("next-test-native-cuts-b", b_retained, b_count),
            ] {
                let target = targets
                    .iter()
                    .find(|target| target.request == request)
                    .unwrap();
                assert_eq!(target.retained, retained, "{request}");
                assert_eq!(target.surviving_factories, count, "{request}");
            }
            assert!(plan.retained_single_native_unmock().is_none());
            assert!(plan.cancelled_single_native_unmock().is_none());
            assert!(extract_static_mocks(source, "entry.mjs").is_err());
            assert!(!plan.source.contains("vi.mock("));
            assert!(!plan.source.contains("vi.unmock("));
        }
    }

    #[test]
    fn every_group_keeps_its_factory_cut_runtime_and_actual_owner() {
        let source =
            include_str!("../tests/fixtures/native-multi-target/both-survive-interleaved.mjs");
        for change in 0..16 {
            let mut plan = extract_test_mocks(source, "entry.mjs").unwrap();
            match change {
                0 => plan
                    .unmocks
                    .retain(|cut| cut.request != "next-test-native-cuts-b"),
                1 => plan
                    .runtime_requests
                    .retain(|request| request != "next-test-native-cuts-b"),
                2 => plan
                    .actual_imports
                    .retain(|actual| actual.request != "next-test-native-cuts-b"),
                3 => plan.declarations[0].request = "other".into(),
                4 => plan.declarations[1].factory_start = plan.declarations[0].factory_start,
                5 => plan.unmocks[0].end = plan.unmocks[0].start,
                6 => plan.unmocks[0].end = plan.declarations[0].factory_start + 1,
                7 => plan.reset_modules = false,
                8 => plan.declarations[0].automatic = true,
                9 => plan.declarations[0].spy = true,
                10 => plan.runtime_requests.push(plan.runtime_requests[0].clone()),
                11 => plan.actual_imports[0].request = "other".into(),
                12 => plan.unmocks.swap(0, 1),
                13 => plan.declarations[0].original_factory_source.clear(),
                14 => plan.declarations.swap(0, 1),
                15 => plan.declarations[0].factory_start = usize::MAX,
                _ => unreachable!(),
            }
            assert!(plan.native_unmock_targets().is_none(), "{change}");
        }
    }

    #[test]
    fn rejects_unpaired_or_nondirect_second_target_before_assembly() {
        let source =
            include_str!("../tests/fixtures/native-multi-target/both-survive-interleaved.mjs");
        for altered in [
            source.replace(
                "vi.importActual('next-test-native-cuts-b')",
                "vi.importActual('next-test-native-cuts-a')",
            ),
            source.replace(
                "vi.unmock('next-test-native-cuts-b')",
                "consume(() => vi.unmock('next-test-native-cuts-b'))",
            ),
            source.replace("vi.unmock('next-test-native-cuts-b')", "vi.unmock('other')"),
            source.replace("vi.doMock('next-test-native-cuts-b'", "vi.doMock('other'"),
        ] {
            assert!(extract_test_mocks(&altered, "entry.mjs").is_err());
        }
    }

    #[test]
    fn canonical_ownership_rejects_alias_collisions_and_unstable_request_resolution() {
        let mut known = HashMap::new();
        let target = |request: &str| NativeUnmockTarget {
            request: request.into(),
            retained: true,
            surviving_factories: 1,
        };
        assert!(native_unmock_original_is_available(&known, &1, "a"));
        known.insert(1, target("a"));
        assert!(native_unmock_original_is_available(&known, &1, "a"));
        assert!(native_unmock_original_is_available(&known, &2, "b"));
        assert!(!native_unmock_original_is_available(&known, &1, "b"));
        assert!(!native_unmock_original_is_available(&known, &2, "a"));
        known.insert(2, target("b"));
        assert!(native_unmock_original_is_available(&known, &2, "b"));
        assert!(!native_unmock_original_is_available(&known, &2, "a"));
        assert_eq!(known.len(), 2);
    }
    #[test]
    fn multi_target_subpaths_stay_outside_the_qualified_root_scope() {
        let source =
            include_str!("../tests/fixtures/native-multi-target/both-survive-interleaved.mjs");
        let altered = source.replace(
            "'next-test-native-cuts-b'",
            "'next-test-native-cuts-b/subpath'",
        );
        if let Ok(plan) = extract_test_mocks(&altered, "entry.mjs") {
            assert!(plan.native_unmock_targets().is_none());
        }
    }
}

#[cfg(test)]
mod factory_parameter_plan_tests {
    use crate::testing_mock_source::extract_static_mocks;

    #[test]
    fn retains_the_actual_factory_parameter_fact_without_reading_source_strings() {
        for (factory, expected) in [
            ("()=>({value:1})", false),
            ("function(){return {value:1}}", false),
            ("(importOriginal)=>({value:1})", true),
            ("function(importOriginal){return {value:1}}", true),
            ("(...args)=>({value:1})", true),
            ("(importOriginal = 1)=>({value:1})", true),
        ] {
            let source = format!("import {{vi}} from 'vitest';vi.mock('./target.cjs',{factory})");
            let plan = extract_static_mocks(&source, "spec.mjs").unwrap();
            assert_eq!(plan.declarations.len(), 1);
            assert_eq!(plan.declarations[0].has_parameters, expected, "{factory}");
        }
    }

    #[test]
    fn keeps_existing_direct_and_aliased_arguments_capture_rejections() {
        for factory in [
            "function(){return {value:arguments[0]()}}",
            "function(){const original=arguments[0];return {value:original()}}",
            "()=>({value:arguments[0]()})",
        ] {
            let source = format!("import {{vi}} from 'vitest';vi.mock('./target.cjs',{factory})");
            let error = extract_static_mocks(&source, "spec.mjs")
                .err()
                .expect("existing arguments capture guard");
            assert!(
                error.to_string().contains("capture of arguments"),
                "{factory}: {error}"
            );
        }
    }

    #[test]
    fn automatic_and_spy_declarations_do_not_invent_a_factory_parameter() {
        for source in [
            "import {vi} from 'vitest';vi.mock('./target.cjs')",
            "import {vi} from 'vitest';vi.mock('./target.cjs',{spy:true})",
        ] {
            let plan = extract_static_mocks(source, "spec.mjs").unwrap();
            assert!(plan.declarations[0].automatic);
            assert!(!plan.declarations[0].has_parameters);
        }
    }
}

#[cfg(test)]
mod original_require_reset_plan_tests {
    use crate::testing_mock_source::{extract_static_mocks, extract_test_mocks};

    #[test]
    fn retains_only_runtime_aware_relative_original_reset_candidates() {
        for factory in [
            "()=>({value:1})",
            "function(){return {value:1}}",
            "()=>{globalThis.counter=(globalThis.counter??0)+1;return {value:1}}",
        ] {
            let source = format!(
                "import {{vi}} from 'vitest';vi.mock('./target.cjs',{factory});vi.resetModules()"
            );
            assert!(extract_static_mocks(&source, "spec.mjs").is_err());
            let plan = extract_test_mocks(&source, "spec.mjs").unwrap();
            assert!(plan.commonjs_original_reset_candidate(), "{factory}");
            assert!(plan.reset_modules);
            assert!(plan.runtime_requests.is_empty());
            assert_eq!(plan.declarations[0].original_factory_source, factory);
        }
    }

    #[test]
    fn refuses_factory_arguments_helpers_and_reflective_loader_escapes() {
        for factory in [
            "(original)=>({value:1})",
            "(...args)=>({value:1})",
            "function(){return {value:arguments[0]()}}",
            "function(){const actual=arguments[0];return {value:actual()}}",
            "()=>({value:vi})",
            "()=>{const api=vi;return {value:api}}",
            "()=>({value:vi.importActual('./target.cjs')})",
            "()=>({value:import('./target.cjs')})",
            "()=>({value:globalThis.eval('1')})",
            "()=>({value:globalThis['eval']('1')})",
            "()=>({value:globalThis['e'+'val']('1')})",
            "()=>({value:globalThis[globalThis.key]})",
        ] {
            let source = format!(
                "import {{vi}} from 'vitest';vi.mock('./target.cjs',{factory});vi.resetModules()"
            );
            assert!(
                extract_test_mocks(&source, "spec.mjs").is_err(),
                "accepted {factory}"
            );
        }
    }

    #[test]
    fn uses_actual_imported_api_identity_and_preserves_shadowed_locals() {
        let escaped = "import {vi as tools} from \
                       'vitest';tools.mock('./target.cjs',()=>({value:tools}));tools.\
                       resetModules()";
        assert!(extract_test_mocks(escaped, "spec.mjs").is_err());
        let local = "import {vi as tools} from 'vitest';tools.mock('./target.cjs',()=>{const \
                     tools={value:1};return {value:tools.value}});tools.resetModules()";
        assert!(
            extract_test_mocks(local, "spec.mjs")
                .unwrap()
                .commonjs_original_reset_candidate()
        );
    }

    #[test]
    fn keeps_other_static_reset_combinations_outside_the_candidate() {
        for body in [
            "vi.mock('package',()=>({value:1}))",
            "vi.mock('./target.cjs?raw',()=>({value:1}))",
            "vi.mock('./target.cjs', {spy:true})",
            "vi.mock('./target.cjs')",
            "vi.mock('./target.cjs',()=>({value:1}));vi.mock('./other.cjs',()=>({value:2}))",
            "const state=vi.hoisted(()=>({value:1}));vi.mock('./target.cjs',()=>({value:state.\
             value}))",
            "vi.mock('./target.cjs',()=>({value:1}));vi.importActual('./target.cjs')",
            "vi.mock('./target.cjs',()=>({value:1}));vi.importMock('./target.cjs')",
            "vi.mock('./target.cjs',()=>({value:1}));vi.doMock('./target.cjs',()=>({value:2}))",
            "vi.mock('./target.cjs',()=>({value:1}));vi.unmock('./target.cjs')",
            "vi.mock('./target.cjs',()=>({value:1}));vi.doUnmock('./target.cjs')",
        ] {
            let source = format!("import {{vi}} from 'vitest';{body};vi.resetModules()");
            match extract_test_mocks(&source, "spec.mjs") {
                Ok(plan) => assert!(!plan.commonjs_original_reset_candidate(), "{body}"),
                Err(_) => {}
            }
        }
    }
}
