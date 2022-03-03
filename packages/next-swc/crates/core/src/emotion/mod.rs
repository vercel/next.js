use std::borrow::Cow;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use fxhash::FxHashMap;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use swc::sourcemap::{RawToken, SourceMap as RawSourcemap};
use swc_common::util::take::Take;
use swc_common::{BytePos, SourceMap, DUMMY_SP};
use swc_ecmascript::ast::Tpl;
use swc_ecmascript::{
    ast::{
        Callee, Expr, ExprOrSpread, Ident, ImportDecl, ImportSpecifier, KeyValueProp, Lit,
        MemberProp, ObjectLit, Pat, Prop, PropName, PropOrSpread, VarDeclarator,
    },
    codegen::util::SourceMapperExt,
    visit::{swc_ecma_ast::CallExpr, Fold, FoldWith},
};

mod hash;

static EMOTION_OFFICIAL_LIBRARIES: Lazy<Vec<EmotionModuleConfig>> = Lazy::new(|| {
    vec![
        EmotionModuleConfig {
            module_name: "@emotion/styled".to_owned(),
            exported_names: vec![],
            default_export: Some(ExprKind::Styled),
        },
        EmotionModuleConfig {
            module_name: "@emotion/react".to_owned(),
            exported_names: vec![ExportItem {
                name: "css".to_owned(),
                kind: ExprKind::Css,
            }],
            ..Default::default()
        },
        EmotionModuleConfig {
            module_name: "@emotion/primitives".to_owned(),
            exported_names: vec![ExportItem {
                name: "css".to_owned(),
                kind: ExprKind::Css,
            }],
            default_export: Some(ExprKind::Styled),
        },
        EmotionModuleConfig {
            module_name: "@emotion/native".to_owned(),
            exported_names: vec![ExportItem {
                name: "css".to_owned(),
                kind: ExprKind::Css,
            }],
            default_export: Some(ExprKind::Styled),
        },
    ]
});

static SPACE_AROUND_COLON: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s*(?P<s>[:|;])\s*").unwrap());

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmotionOptions {
    pub enabled: Option<bool>,
    pub sourcemap: Option<bool>,
    pub auto_label: Option<bool>,
    pub label_format: Option<String>,
    pub custom_modules: Option<Vec<EmotionModuleConfig>>,
}

impl Default for EmotionOptions {
    fn default() -> Self {
        EmotionOptions {
            enabled: Some(false),
            sourcemap: Some(true),
            auto_label: Some(true),
            label_format: Some("[local]".to_owned()),
            custom_modules: None,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EmotionModuleConfig {
    module_name: String,
    exported_names: Vec<ExportItem>,
    default_export: Option<ExprKind>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct ExportItem {
    name: String,
    kind: ExprKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum ImportType {
    Named,
    Namespace,
    Default,
}

impl Default for ImportType {
    fn default() -> Self {
        ImportType::Named
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
enum ExprKind {
    Css,
    Styled,
}

impl Default for ExprKind {
    fn default() -> Self {
        ExprKind::Css
    }
}

#[derive(Debug)]
enum PackageMeta {
    Named(ExprKind),
    Namespace(EmotionModuleConfig),
}

pub fn emotion(emotion_options: EmotionOptions, path: &Path, cm: Arc<SourceMap>) -> impl Fold {
    EmotionTransformer::new(emotion_options, path, cm)
}

pub struct EmotionTransformer {
    pub options: EmotionOptions,
    filepath_hash: Option<u32>,
    filepath: PathBuf,
    dir: Option<String>,
    filename: Option<String>,
    cm: Arc<SourceMap>,
    custom_modules: Vec<EmotionModuleConfig>,
    import_packages: FxHashMap<String, PackageMeta>,
    emotion_target_class_name_count: usize,
    current_context: Option<String>,
}

impl EmotionTransformer {
    pub fn new(options: EmotionOptions, path: &Path, cm: Arc<SourceMap>) -> Self {
        EmotionTransformer {
            custom_modules: options.custom_modules.clone().unwrap_or_default(),
            options,
            filepath_hash: None,
            filepath: path.to_owned(),
            dir: path.parent().and_then(|p| p.to_str()).map(|s| s.to_owned()),
            filename: path
                .file_name()
                .and_then(|filename| filename.to_str())
                .map(|s| s.to_owned()),
            cm,
            import_packages: FxHashMap::default(),
            emotion_target_class_name_count: 0,
            current_context: None,
        }
    }

    #[inline]
    // Compute file hash on demand
    // Memorize the hash of the file name
    fn get_filename_hash(&mut self) -> u32 {
        if self.filepath_hash.is_none() {
            self.filepath_hash = Some(hash::murmurhash2(
                self.filepath.to_string_lossy().as_bytes(),
                0,
            ));
        }
        self.filepath_hash.unwrap()
    }

    fn create_label(&self, with_prefix: bool) -> String {
        let prefix = if with_prefix { "label:" } else { "" };
        let mut label = format!(
            "{}{}",
            prefix,
            self.options
                .label_format
                .clone()
                .unwrap_or_else(|| "[local]".to_owned())
        );
        if let Some(current_context) = &self.current_context {
            label = label.replace("[local]", current_context);
            if let Some(filename) = self.filename.as_ref() {
                label = label.replace("[filename]", filename);
            }
            if let Some(dir) = self.dir.as_ref() {
                label = label.replace("[dir]", dir);
            };
        }
        label
    }

    fn create_sourcemap(&mut self, pos: BytePos) -> Option<String> {
        if self.options.sourcemap.unwrap_or(false) {
            let loc = self.cm.get_code_map().lookup_char_pos(pos);
            let filename = self.filepath.to_str().map(|s| s.to_owned());
            let cm = RawSourcemap::new(
                filename.clone(),
                vec![RawToken {
                    dst_line: 0,
                    dst_col: 0,
                    src_line: loc.line as u32 - 1,
                    src_col: loc.col_display as u32,
                    src_id: 0,
                    name_id: 0,
                }],
                Vec::new(),
                vec![filename.unwrap_or_default()],
                Some(vec![Some(loc.file.src.to_string())]),
            );
            let mut writer = Vec::new();
            if cm.to_writer(&mut writer).is_ok() {
                return Some(format!(
                    "/*# sourceMappingURL=data:application/json;charset=utf-8;base64,{} */",
                    base64::encode(writer)
                ));
            }
        }
        None
    }

    // Find the imported name from modules
    // These import statements are supported:
    //    import styled from '@emotion/styled'
    //    import { default as whateverStyled } from '@emotion/styled'
    //    import { css } from '@emotion/react'
    //    import * as emotionCss from '@emotion/react'
    fn generate_import_info(&mut self, expr: &ImportDecl) {
        for c in EMOTION_OFFICIAL_LIBRARIES
            .iter()
            .chain(self.custom_modules.iter())
        {
            if expr.src.value == c.module_name {
                for specifier in expr.specifiers.iter() {
                    match specifier {
                        ImportSpecifier::Named(named) => {
                            for exported in c.exported_names.iter() {
                                if named.local.as_ref() == exported.name {
                                    self.import_packages.insert(
                                        named.local.as_ref().to_owned(),
                                        PackageMeta::Named(exported.kind),
                                    );
                                }
                            }
                        }
                        ImportSpecifier::Default(default) => {
                            if let Some(kind) = c.default_export {
                                self.import_packages.insert(
                                    default.local.as_ref().to_owned(),
                                    PackageMeta::Named(kind),
                                );
                            }
                        }
                        ImportSpecifier::Namespace(namespace) => {
                            self.import_packages.insert(
                                namespace.local.as_ref().to_owned(),
                                PackageMeta::Namespace(c.clone()),
                            );
                        }
                    }
                }
            }
        }
    }

    fn create_target_arg_node(&mut self) -> PropOrSpread {
        let stable_class_name = format!(
            "e{}{}",
            radix_fmt::radix_36(self.get_filename_hash()),
            self.emotion_target_class_name_count
        );
        self.emotion_target_class_name_count += 1;
        PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
            key: PropName::Ident(Ident::new("target".into(), DUMMY_SP)),
            value: Box::new(Expr::Lit(Lit::Str(stable_class_name.into()))),
        })))
    }

    fn create_args_from_tagged_tpl(&self, tagged_tpl: &mut Tpl) -> Vec<ExprOrSpread> {
        let args_len = tagged_tpl.exprs.len() + tagged_tpl.quasis.len();
        // 2 more capacity is for `label` and `sourceMap`
        let mut args = Vec::with_capacity(args_len + 2);
        for index in 0..args_len {
            let i = index / 2;
            if index % 2 == 0 {
                if let Some(q) = tagged_tpl.quasis.get_mut(i) {
                    let q = q.take();
                    let minified = minify_css_string(q.raw.value.as_ref());
                    if !minified.is_empty() {
                        args.push(ExprOrSpread {
                            spread: None,
                            expr: Box::new(Expr::Lit(Lit::Str(minified.into()))),
                        });
                    }
                }
            } else if let Some(e) = tagged_tpl.exprs.get_mut(i) {
                args.push(ExprOrSpread {
                    spread: None,
                    expr: e.take(),
                });
            }
        }
        args
    }
}

impl Fold for EmotionTransformer {
    // Collect import modules that indicator if this file need to be transformed
    fn fold_import_decl(&mut self, expr: ImportDecl) -> ImportDecl {
        if expr.type_only {
            return expr;
        }
        self.generate_import_info(&expr);
        expr
    }

    fn fold_var_declarator(&mut self, dec: VarDeclarator) -> VarDeclarator {
        if let Pat::Ident(i) = &dec.name {
            self.current_context = Some(i.id.as_ref().to_owned());
        }
        dec.fold_children_with(self)
    }

    fn fold_call_expr(&mut self, mut expr: CallExpr) -> CallExpr {
        // If no package that we care about is imported, skip the following
        // transformation logic.
        if self.import_packages.is_empty() {
            return expr;
        }
        if let Callee::Expr(e) = &mut expr.callee {
            match e.as_mut() {
                // css({})
                Expr::Ident(i) => {
                    if let Some(package) = self.import_packages.get(i.as_ref()) {
                        if !expr.args.is_empty() {
                            if let PackageMeta::Named(kind) = package {
                                if matches!(kind, ExprKind::Css) {
                                    if self.options.auto_label.unwrap_or(false) {
                                        expr.args.push(ExprOrSpread {
                                            spread: None,
                                            expr: Box::new(Expr::Lit(Lit::Str(
                                                self.create_label(true).into(),
                                            ))),
                                        });
                                    }
                                    if let Some(cm) = self.create_sourcemap(expr.span.lo) {
                                        expr.args.push(ExprOrSpread {
                                            spread: None,
                                            expr: Box::new(Expr::Lit(Lit::Str(cm.into()))),
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
                // styled('div')({})
                Expr::Call(c) => {
                    if let Callee::Expr(callee_exp) = &c.callee {
                        if let Expr::Ident(i) = callee_exp.as_ref() {
                            if let Some(PackageMeta::Named(ExprKind::Styled)) =
                                self.import_packages.get(i.as_ref())
                            {
                                if !c.args.is_empty() {
                                    let mut args_props = Vec::with_capacity(2);
                                    args_props.push(self.create_target_arg_node());
                                    if self.options.auto_label.unwrap_or(false) {
                                        args_props.push(PropOrSpread::Prop(Box::new(
                                            Prop::KeyValue(KeyValueProp {
                                                key: PropName::Ident(Ident::new(
                                                    "label".into(),
                                                    DUMMY_SP,
                                                )),
                                                value: Box::new(Expr::Lit(Lit::Str(
                                                    self.create_label(false).into(),
                                                ))),
                                            }),
                                        )));
                                    }
                                    if let Some(cm) = self.create_sourcemap(expr.span.lo()) {
                                        c.args.push(ExprOrSpread {
                                            spread: None,
                                            expr: Box::new(Expr::Lit(Lit::Str(cm.into()))),
                                        });
                                    }
                                    c.args.push(ExprOrSpread {
                                        spread: None,
                                        expr: Box::new(Expr::Object(ObjectLit {
                                            span: DUMMY_SP,
                                            props: args_props,
                                        })),
                                    });
                                }
                            }
                        }
                    }
                }
                // styled.div({})
                // customEmotionReact.css({})
                Expr::Member(m) => {
                    if let Expr::Ident(i) = m.obj.as_ref() {
                        if let Some(package) = self.import_packages.get(i.as_ref()) {
                            if let PackageMeta::Named(kind) = package {
                                if matches!(kind, ExprKind::Styled) {
                                    if let MemberProp::Ident(prop) = &m.prop {
                                        let mut args_props = Vec::with_capacity(2);
                                        args_props.push(self.create_target_arg_node());
                                        if self.options.auto_label.unwrap_or(false) {
                                            args_props.push(PropOrSpread::Prop(Box::new(
                                                Prop::KeyValue(KeyValueProp {
                                                    key: PropName::Ident(Ident::new(
                                                        "label".into(),
                                                        DUMMY_SP,
                                                    )),
                                                    value: Box::new(Expr::Lit(Lit::Str(
                                                        self.create_label(false).into(),
                                                    ))),
                                                }),
                                            )));
                                        }
                                        if let Some(cm) = self.create_sourcemap(expr.span.lo()) {
                                            args_props.push(PropOrSpread::Prop(Box::new(
                                                Prop::KeyValue(KeyValueProp {
                                                    key: PropName::Ident(Ident::new(
                                                        "map".into(),
                                                        DUMMY_SP,
                                                    )),
                                                    value: Box::new(Expr::Lit(Lit::Str(cm.into()))),
                                                }),
                                            )));
                                        }
                                        return CallExpr {
                                            span: expr.span,
                                            type_args: expr.type_args,
                                            args: expr.args,
                                            callee: Callee::Expr(Box::new(Expr::Call(CallExpr {
                                                span: DUMMY_SP,
                                                type_args: None,
                                                callee: Callee::Expr(Box::new(Expr::Ident(
                                                    Ident::new(i.sym.clone(), i.span),
                                                ))),
                                                args: vec![
                                                    ExprOrSpread {
                                                        spread: None,
                                                        expr: Box::new(Expr::Lit(Lit::Str(
                                                            prop.as_ref().into(),
                                                        ))),
                                                    },
                                                    ExprOrSpread {
                                                        spread: None,
                                                        expr: Box::new(Expr::Object(ObjectLit {
                                                            span: DUMMY_SP,
                                                            props: args_props,
                                                        })),
                                                    },
                                                ],
                                            }))),
                                        };
                                    }
                                }
                            }
                            if let PackageMeta::Namespace(c) = package {
                                if c.exported_names
                                    .iter()
                                    .any(|n| match_css_export(n, &m.prop))
                                {
                                    if self.options.auto_label.unwrap_or(false) {
                                        expr.args.push(ExprOrSpread {
                                            spread: None,
                                            expr: Box::new(Expr::Lit(Lit::Str(
                                                self.create_label(true).into(),
                                            ))),
                                        });
                                    }
                                    if let Some(sm) = self.create_sourcemap(expr.span.lo()) {
                                        expr.args.push(ExprOrSpread {
                                            spread: None,
                                            expr: Box::new(Expr::Lit(Lit::Str(sm.into()))),
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        }
        expr
    }

    fn fold_expr(&mut self, mut expr: Expr) -> Expr {
        if let Expr::TaggedTpl(tagged_tpl) = &mut expr {
            // styled('div')``
            match tagged_tpl.tag.as_mut() {
                Expr::Call(call) => {
                    if let Callee::Expr(callee) = &call.callee {
                        if let Expr::Ident(i) = callee.as_ref() {
                            if let Some(PackageMeta::Named(ExprKind::Styled)) =
                                self.import_packages.get(i.as_ref())
                            {
                                let mut callee = call.take();
                                let mut object_props = Vec::with_capacity(2);
                                object_props.push(self.create_target_arg_node());
                                if self.options.auto_label.unwrap_or(false) {
                                    object_props.push(PropOrSpread::Prop(Box::new(
                                        Prop::KeyValue(KeyValueProp {
                                            key: PropName::Ident(Ident::new(
                                                "label".into(),
                                                DUMMY_SP,
                                            )),
                                            value: Box::new(Expr::Lit(Lit::Str(
                                                self.create_label(false).into(),
                                            ))),
                                        }),
                                    )));
                                }
                                if let Some(cm) = self.create_sourcemap(call.span.lo()) {
                                    callee.args.push(ExprOrSpread {
                                        spread: None,
                                        expr: Box::new(Expr::Lit(Lit::Str(cm.into()))),
                                    });
                                }
                                callee.args.push(ExprOrSpread {
                                    spread: None,
                                    expr: Box::new(Expr::Object(ObjectLit {
                                        span: DUMMY_SP,
                                        props: object_props,
                                    })),
                                });
                                return Expr::Call(CallExpr {
                                    span: DUMMY_SP,
                                    callee: Callee::Expr(Box::new(Expr::Call(callee))),
                                    args: self
                                        .create_args_from_tagged_tpl(&mut tagged_tpl.tpl)
                                        .into_iter()
                                        .map(|exp| exp.fold_children_with(self))
                                        .collect(),
                                    type_args: None,
                                });
                            }
                        }
                    }
                }
                // css``
                Expr::Ident(i) => {
                    if let Some(PackageMeta::Named(ExprKind::Css)) =
                        self.import_packages.get(i.as_ref())
                    {
                        let mut args = self.create_args_from_tagged_tpl(&mut tagged_tpl.tpl);
                        if self.options.auto_label.unwrap_or(false) {
                            args.push(ExprOrSpread {
                                spread: None,
                                expr: Box::new(Expr::Lit(Lit::Str(
                                    self.create_label(false).into(),
                                ))),
                            });
                        }
                        if let Some(cm) = self.create_sourcemap(tagged_tpl.span.lo()) {
                            args.push(ExprOrSpread {
                                spread: None,
                                expr: Box::new(Expr::Lit(Lit::Str(cm.into()))),
                            });
                        }
                        return Expr::Call(CallExpr {
                            span: DUMMY_SP,
                            callee: Callee::Expr(Box::new(Expr::Ident(i.take()))),
                            args,
                            type_args: None,
                        });
                    }
                }
                // styled.div``
                // customEmotionReact.css``
                Expr::Member(member_expr) => {
                    if let Expr::Ident(i) = member_expr.obj.as_mut() {
                        if let Some(p) = self.import_packages.get(i.as_ref()) {
                            match p {
                                PackageMeta::Named(ExprKind::Styled) => {
                                    if let MemberProp::Ident(prop) = &mut member_expr.prop {
                                        let mut object_props = Vec::with_capacity(2);
                                        object_props.push(self.create_target_arg_node());
                                        if self.options.auto_label.unwrap_or(false) {
                                            object_props.push(PropOrSpread::Prop(Box::new(
                                                Prop::KeyValue(KeyValueProp {
                                                    key: PropName::Ident(Ident::new(
                                                        "label".into(),
                                                        DUMMY_SP,
                                                    )),
                                                    value: Box::new(Expr::Lit(Lit::Str(
                                                        self.create_label(false).into(),
                                                    ))),
                                                }),
                                            )));
                                        }
                                        let mut args =
                                            self.create_args_from_tagged_tpl(&mut tagged_tpl.tpl);
                                        if let Some(cm) =
                                            self.create_sourcemap(member_expr.span.lo())
                                        {
                                            args.push(ExprOrSpread {
                                                spread: None,
                                                expr: Box::new(Expr::Lit(Lit::Str(cm.into()))),
                                            });
                                        }
                                        return Expr::Call(CallExpr {
                                            span: DUMMY_SP,
                                            type_args: None,
                                            callee: Callee::Expr(Box::new(Expr::Call(CallExpr {
                                                type_args: None,
                                                span: DUMMY_SP,
                                                callee: Callee::Expr(Box::new(Expr::Ident(
                                                    i.take(),
                                                ))),
                                                args: vec![
                                                    ExprOrSpread {
                                                        spread: None,
                                                        expr: Box::new(Expr::Lit(Lit::Str(
                                                            prop.take().sym.into(),
                                                        ))),
                                                    },
                                                    ExprOrSpread {
                                                        spread: None,
                                                        expr: Box::new(Expr::Object(ObjectLit {
                                                            span: DUMMY_SP,
                                                            props: object_props,
                                                        })),
                                                    },
                                                ],
                                            }))),
                                            args,
                                        });
                                    }
                                }
                                PackageMeta::Namespace(c) => {
                                    if c.exported_names
                                        .iter()
                                        .any(|item| match_css_export(item, &member_expr.prop))
                                    {
                                        return Expr::Call(CallExpr {
                                            span: DUMMY_SP,
                                            callee: Callee::Expr(Box::new(Expr::Member(
                                                member_expr.take(),
                                            ))),
                                            args: {
                                                let mut args = self.create_args_from_tagged_tpl(
                                                    &mut tagged_tpl.tpl,
                                                );
                                                if self.options.auto_label.unwrap_or(false) {
                                                    args.push(ExprOrSpread {
                                                        spread: None,
                                                        expr: Box::new(Expr::Lit(Lit::Str(
                                                            self.create_label(true).into(),
                                                        ))),
                                                    });
                                                }
                                                if let Some(cm) =
                                                    self.create_sourcemap(tagged_tpl.span.lo())
                                                {
                                                    args.push(ExprOrSpread {
                                                        spread: None,
                                                        expr: Box::new(Expr::Lit(Lit::Str(
                                                            cm.into(),
                                                        ))),
                                                    });
                                                }
                                                args
                                            },
                                            type_args: None,
                                        });
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        expr.fold_children_with(self)
    }
}

fn match_css_export(item: &ExportItem, prop: &MemberProp) -> bool {
    if matches!(item.kind, ExprKind::Css) {
        if let MemberProp::Ident(prop) = prop {
            if item.name.as_str() == prop.sym.as_ref() {
                return true;
            }
        }
    }
    false
}

#[inline]
fn minify_css_string(input: &str) -> Cow<str> {
    let pattern = |c| c == ' ' || c == '\n';
    SPACE_AROUND_COLON.replace_all(input.trim_matches(pattern).trim_end_matches(pattern), "$s")
}
