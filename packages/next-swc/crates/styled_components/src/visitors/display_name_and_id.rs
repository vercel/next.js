use crate::{
    utils::{get_prop_name, prefix_leading_digit, State},
    Config,
};
use once_cell::sync::Lazy;
use regex::Regex;
use std::{cell::RefCell, convert::TryInto, path::Path, rc::Rc, sync::Arc};
use swc_atoms::{js_word, JsWord};
use swc_common::{util::take::Take, FileName, SourceFile, DUMMY_SP};
use swc_ecmascript::{
    ast::*,
    utils::{quote_ident, ExprFactory},
    visit::{as_folder, noop_visit_mut_type, Fold, VisitMut, VisitMutWith},
};
use tracing::{span, trace, Level};

pub fn display_name_and_id(
    file: Arc<SourceFile>,
    config: Rc<Config>,
    state: Rc<RefCell<State>>,
) -> impl Fold + VisitMut {
    as_folder(DisplayNameAndId {
        file,
        config,
        state,
        cur_display_name: Default::default(),
        component_id: 0,
    })
}

static DISPLAY_NAME_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^[a-zA-Z][a-zA-Z0-9]$").unwrap());

#[derive(Debug)]
struct DisplayNameAndId {
    file: Arc<SourceFile>,
    config: Rc<Config>,
    state: Rc<RefCell<State>>,

    cur_display_name: Option<JsWord>,

    component_id: usize,
}

impl DisplayNameAndId {
    fn get_block_name(&self, p: &Path) -> String {
        let file_stem = p.file_stem();
        if let Some(file_stem) = file_stem {
            if file_stem == "index" {
            } else {
                return file_stem.to_string_lossy().to_string();
            }
        } else {
        }

        self.get_block_name(p.parent().expect("/index/index/index?"))
    }

    fn get_display_name(&mut self, _: &Expr) -> JsWord {
        let component_name = self.cur_display_name.clone().unwrap_or(js_word!(""));

        match &self.file.name {
            FileName::Real(f) if self.config.file_name => {
                let block_name = self.get_block_name(f);

                if block_name == *component_name {
                    return component_name;
                }

                if component_name.is_empty() {
                    return prefix_leading_digit(&block_name).into();
                }

                format!("{}__{}", prefix_leading_digit(&block_name), component_name).into()
            }

            _ => component_name,
        }
    }

    fn next_id(&mut self) -> usize {
        let ret = self.component_id;
        self.component_id += 1;
        ret
    }

    fn get_component_id(&mut self) -> String {
        // Prefix the identifier with a character because CSS classes cannot start with
        // a number

        let next_id = self.next_id();

        let hash = {
            let base = self.file.src_hash;
            let base = base.to_be_bytes();
            let a = u32::from_be_bytes(base[0..4].try_into().unwrap());
            let b = u32::from_be_bytes(base[4..8].try_into().unwrap());
            let c = u32::from_be_bytes(base[8..12].try_into().unwrap());
            let d = u32::from_be_bytes(base[12..16].try_into().unwrap());

            a ^ b ^ c ^ d
        };

        format!("{}sc-{:x}-{}", self.config.use_namespace(), hash, next_id)
    }

    fn add_config(
        &mut self,
        e: &mut Expr,
        display_name: Option<JsWord>,
        component_id: Option<JsWord>,
    ) {
        if display_name.is_none() && component_id.is_none() {
            return;
        }

        let mut with_config_props = vec![];

        if let Some(display_name) = display_name {
            with_config_props.push(PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                key: PropName::Ident(quote_ident!("displayName")),
                value: Box::new(Expr::Lit(Lit::Str(Str {
                    span: DUMMY_SP,
                    value: display_name,
                    raw: None,
                }))),
            }))))
        }

        if let Some(component_id) = component_id {
            with_config_props.push(PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                key: PropName::Ident(quote_ident!("componentId")),
                value: Box::new(Expr::Lit(Lit::Str(Str {
                    span: DUMMY_SP,
                    value: component_id,
                    raw: None,
                }))),
            }))))
        }

        get_existing_config(e, |e| {
            if let Expr::Call(CallExpr { args, .. }) = e {
                if let Some(Expr::Object(existing_config)) = args.get_mut(0).map(|v| &mut *v.expr) {
                    if !already_has(existing_config) {
                        existing_config.props.extend(with_config_props.take());
                    }
                }
            }
        });

        if with_config_props.is_empty() {
            return;
        }

        if let Expr::Call(CallExpr {
            callee: Callee::Expr(callee),
            args,
            ..
        }) = e
        {
            if let Expr::Member(MemberExpr {
                prop: MemberProp::Ident(prop),
                ..
            }) = &**callee
            {
                if &*prop.sym == "withConfig" {
                    if let Some(first_arg) = args.get_mut(0) {
                        if first_arg.spread.is_none() && first_arg.expr.is_object() {
                            if let Expr::Object(obj) = &mut *first_arg.expr {
                                if !already_has(&*obj) {
                                    obj.props.extend(with_config_props);
                                    return;
                                }
                            }
                        }
                    }
                }
            }
        }

        if let Expr::TaggedTpl(e) = e {
            e.tag = Box::new(Expr::Call(CallExpr {
                span: DUMMY_SP,
                callee: e
                    .tag
                    .take()
                    .make_member(quote_ident!("withConfig"))
                    .as_callee(),
                args: vec![ObjectLit {
                    span: DUMMY_SP,
                    props: with_config_props,
                }
                .as_arg()],
                type_args: Default::default(),
            }));
            return;
        }

        if let Expr::Call(CallExpr {
            callee: Callee::Expr(callee),
            ..
        }) = e
        {
            *callee = Box::new(Expr::Call(CallExpr {
                span: DUMMY_SP,
                callee: callee
                    .take()
                    .make_member(quote_ident!("withConfig"))
                    .as_callee(),
                args: vec![ObjectLit {
                    span: DUMMY_SP,
                    props: with_config_props,
                }
                .as_arg()],
                type_args: Default::default(),
            }));
            return;
        }

        unreachable!("expr should be tagged tpl or call expr");
    }
}

impl VisitMut for DisplayNameAndId {
    noop_visit_mut_type!();

    fn visit_mut_assign_expr(&mut self, e: &mut AssignExpr) {
        let old = self.cur_display_name.clone();

        if old.is_none() {
            self.cur_display_name = e.left.as_ident().map(|v| v.sym.clone());
        }

        e.visit_mut_children_with(self);

        self.cur_display_name = old;
    }

    fn visit_mut_class_prop(&mut self, e: &mut ClassProp) {
        let old = self.cur_display_name.take();

        if let PropName::Ident(i) = &e.key {
            self.cur_display_name = Some(i.sym.clone());
        }

        e.visit_mut_children_with(self);

        self.cur_display_name = old;
    }

    fn visit_mut_expr(&mut self, expr: &mut Expr) {
        expr.visit_mut_children_with(self);

        let is_styled = match expr {
            Expr::TaggedTpl(e) => self.state.borrow().is_styled(&e.tag),

            Expr::Call(CallExpr {
                callee: Callee::Expr(callee),
                args,
                ..
            }) => {
                (
                    // styled()
                    self.state.borrow().is_styled(&*callee)
                        && get_property_as_ident(callee)
                            .map(|v| v == "withConfig")
                            .unwrap_or(false)
                ) || (
                    // styled(x)({})
                    self.state.borrow().is_styled(&*callee)
                        && !get_callee(callee)
                            .map(|callee| callee.is_member())
                            .unwrap_or(false)
                ) || (
                    // styled(x).attrs()({})
                    self.state.borrow().is_styled(callee)
                        && get_callee(callee)
                            .map(|callee| {
                                callee.is_member()
                                    && get_property_as_ident(callee)
                                        .map(|v| v == "withConfig")
                                        .unwrap_or(false)
                            })
                            .unwrap_or(false)
                ) || (
                    // styled(x).withConfig({})
                    self.state.borrow().is_styled(&*callee)
                        && get_callee(callee)
                            .map(|callee| {
                                callee.is_member()
                                    && get_property_as_ident(callee)
                                        .map(|v| v == "withConfig")
                                        .unwrap_or(false)
                                    && !args.is_empty()
                                    && args[0].spread.is_none()
                                    && match &*args[0].expr {
                                        Expr::Object(first_arg) => {
                                            !first_arg.props.iter().any(|prop| match prop {
                                                PropOrSpread::Prop(prop) => {
                                                    match get_prop_name(prop) {
                                                        Some(PropName::Ident(prop_name)) => {
                                                            match &*prop_name.sym {
                                                                "componentId" | "displayName" => {
                                                                    true
                                                                }
                                                                _ => false,
                                                            }
                                                        }
                                                        _ => false,
                                                    }
                                                }
                                                _ => false,
                                            })
                                        }
                                        _ => false,
                                    }
                            })
                            .unwrap_or(false)
                )
            }

            _ => false,
        };

        if !is_styled {
            return;
        }

        let _tracing = if cfg!(debug_assertions) {
            Some(span!(Level::ERROR, "display_name_and_id").entered())
        } else {
            None
        };

        let display_name = if self.config.display_name {
            Some(self.get_display_name(expr))
        } else {
            None
        };

        trace!("display_name: {:?}", display_name);

        let component_id = if self.config.ssr {
            Some(self.get_component_id().into())
        } else {
            None
        };

        trace!("component_id: {:?}", display_name);

        self.add_config(
            expr,
            display_name.map(|s| DISPLAY_NAME_REGEX.replace_all(&*s, "").into()),
            component_id,
        )
    }

    fn visit_mut_key_value_prop(&mut self, e: &mut KeyValueProp) {
        let old = self.cur_display_name.take();

        if let PropName::Ident(name) = &e.key {
            self.cur_display_name = Some(name.sym.clone());
        }

        e.visit_mut_children_with(self);

        self.cur_display_name = old;
    }

    fn visit_mut_var_declarator(&mut self, v: &mut VarDeclarator) {
        let old = self.cur_display_name.take();

        if let Pat::Ident(name) = &v.name {
            self.cur_display_name = Some(name.id.sym.clone());
        }

        v.visit_mut_children_with(self);

        self.cur_display_name = old;
    }
}

fn get_callee(e: &Expr) -> Option<&Expr> {
    match e {
        Expr::Call(CallExpr {
            callee: Callee::Expr(callee),
            ..
        }) => Some(callee),
        _ => None,
    }
}

fn get_property_as_ident(e: &Expr) -> Option<&JsWord> {
    if let Expr::Member(MemberExpr {
        prop: MemberProp::Ident(p),
        ..
    }) = e
    {
        return Some(&p.sym);
    }

    None
}

fn already_has(obj: &ObjectLit) -> bool {
    obj.props
        .iter()
        .filter_map(|v| match v {
            PropOrSpread::Prop(p) => Some(p),
            _ => None,
        })
        .filter_map(|v| get_prop_name(v))
        .any(|prop| match prop {
            PropName::Ident(ident) => &*ident.sym == "componentId" || &*ident.sym == "displayName",
            _ => false,
        })
}

fn get_existing_config<F>(e: &mut Expr, op: F)
where
    F: FnOnce(&mut Expr),
{
    if let Expr::Call(CallExpr {
        callee: Callee::Expr(callee),
        ..
    }) = e
    {
        if let Expr::Call(CallExpr {
            callee: Callee::Expr(callee_callee),
            ..
        }) = &mut **callee
        {
            if let Expr::Member(MemberExpr {
                prop: MemberProp::Ident(prop),
                ..
            }) = &**callee_callee
            {
                if &*prop.sym == "withConfig" {
                    return op(callee);
                }
            }

            if let Expr::Member(MemberExpr {
                obj,
                prop: MemberProp::Ident(..),
                ..
            }) = &mut **callee_callee
            {
                if let Expr::Call(CallExpr {
                    callee: Callee::Expr(callee),
                    ..
                }) = &**obj
                {
                    if let Expr::Member(MemberExpr {
                        prop: MemberProp::Ident(prop),
                        ..
                    }) = &**callee
                    {
                        if &*prop.sym == "withConfig" {
                            op(obj)
                        }
                    }
                }
            }
        }
    }
}
