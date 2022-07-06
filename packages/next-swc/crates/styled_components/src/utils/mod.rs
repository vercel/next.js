pub use self::analyzer::{analyze, analyzer};
use std::{borrow::Cow, cell::RefCell};
use swc_atoms::js_word;
use swc_common::{collections::AHashMap, SyntaxContext};
use swc_ecmascript::ast::*;

mod analyzer;

pub(crate) fn get_prop_key_as_expr(p: &Prop) -> Cow<Expr> {
    match p {
        Prop::Shorthand(p) => Cow::Owned(Expr::Ident(p.clone())),
        Prop::KeyValue(p) => prop_name_to_expr(&p.key),
        Prop::Assign(p) => Cow::Owned(Expr::Ident(p.key.clone())),
        Prop::Getter(p) => prop_name_to_expr(&p.key),
        Prop::Setter(p) => prop_name_to_expr(&p.key),
        Prop::Method(p) => prop_name_to_expr(&p.key),
    }
}

pub(crate) fn prop_name_to_expr(p: &PropName) -> Cow<Expr> {
    match p {
        PropName::Ident(p) => Cow::Owned(Expr::Ident(p.clone())),
        PropName::Str(p) => Cow::Owned(Expr::Lit(Lit::Str(p.clone()))),
        PropName::Num(p) => Cow::Owned(Expr::Lit(Lit::Num(p.clone()))),
        PropName::BigInt(p) => Cow::Owned(Expr::Lit(Lit::BigInt(p.clone()))),
        PropName::Computed(e) => Cow::Borrowed(&e.expr),
    }
}

pub(crate) fn get_prop_name(p: &Prop) -> Option<&PropName> {
    match p {
        Prop::Shorthand(..) => None,
        Prop::KeyValue(p) => Some(&p.key),
        Prop::Assign(..) => None,
        Prop::Getter(p) => Some(&p.key),
        Prop::Setter(p) => Some(&p.key),
        Prop::Method(p) => Some(&p.key),
    }
}

pub(crate) fn get_prop_name2(p: &Prop) -> PropName {
    match p {
        Prop::Shorthand(ident) => PropName::Ident(ident.clone()),
        Prop::KeyValue(p) => p.key.clone(),
        Prop::Assign(x) => PropName::Ident(x.key.clone()),
        Prop::Getter(p) => p.key.clone(),
        Prop::Setter(p) => p.key.clone(),
        Prop::Method(p) => p.key.clone(),
    }
}

/// This is created once per file.
#[derive(Debug, Default)]
pub struct State {
    pub(crate) styled_required: Option<Id>,

    unresolved_ctxt: Option<SyntaxContext>,

    imported_local_name: Option<Id>,
    /// Namespace imports
    imported_local_ns: Option<Id>,
    import_name_cache: RefCell<AHashMap<Id, Id>>,
}

impl State {
    pub(crate) fn is_styled(&self, tag: &Expr) -> bool {
        if let Expr::Call(CallExpr {
            callee: Callee::Expr(callee),
            ..
        }) = tag
        {
            if let Expr::Member(MemberExpr {
                obj,
                prop: MemberProp::Ident(prop),
                ..
            }) = &**callee
            {
                if prop.sym != js_word!("default") {
                    return self.is_styled(obj);
                }
            }
        }

        match tag {
            Expr::Member(MemberExpr {
                obj,
                prop: MemberProp::Ident(prop),
                ..
            }) => {
                if let Expr::Ident(obj) = &**obj {
                    if Some(obj.to_id()) == self.import_local_name("default", Some(obj))
                        && !self.is_helper(&Expr::Ident(prop.clone()))
                    {
                        return true;
                    }
                }
            }

            Expr::Call(CallExpr {
                callee: Callee::Expr(callee),
                ..
            }) => {
                if let Expr::Ident(callee) = &**callee {
                    if Some(callee.to_id()) == self.import_local_name("default", Some(callee)) {
                        return true;
                    }
                }
            }

            _ => {}
        }

        // styled-components might be imported using a require()
        if let Some(style_required) = self.styled_required.clone() {
            match tag {
                Expr::Member(MemberExpr {
                    obj,
                    prop: MemberProp::Ident(..),
                    ..
                }) => {
                    if let Expr::Member(MemberExpr {
                        obj: obj_of_obj,
                        prop: MemberProp::Ident(prop),
                        ..
                    }) = &**obj
                    {
                        if let Expr::Ident(obj_of_obj) = &**obj_of_obj {
                            if prop.sym == js_word!("default")
                                && obj_of_obj.to_id() == style_required
                            {
                                return true;
                            }
                        }
                    }
                }

                Expr::Call(CallExpr {
                    callee: Callee::Expr(callee),
                    ..
                }) => {
                    if let Expr::Member(MemberExpr {
                        obj: tag_callee_object,
                        prop: MemberProp::Ident(tag_callee_property),
                        ..
                    }) = &**callee
                    {
                        if let Expr::Ident(tag_callee_object) = &**tag_callee_object {
                            if tag_callee_property.sym == js_word!("default")
                                && tag_callee_object.to_id() == style_required
                            {
                                return true;
                            }
                        }
                    }
                }

                _ => {}
            }
        }

        if let Some(import_local_name) = self.import_local_name("default", None) {
            match tag {
                Expr::Member(MemberExpr {
                    obj,
                    prop: MemberProp::Ident(..),
                    ..
                }) => {
                    if let Expr::Member(MemberExpr {
                        obj: obj_of_obj,
                        prop: MemberProp::Ident(prop),
                        ..
                    }) = &**obj
                    {
                        if let Expr::Ident(obj_of_obj) = &**obj_of_obj {
                            if prop.sym == js_word!("default")
                                && obj_of_obj.to_id() == import_local_name
                            {
                                return true;
                            }
                        }
                    }
                }

                Expr::Call(CallExpr {
                    callee: Callee::Expr(callee),
                    ..
                }) => {
                    if let Expr::Member(MemberExpr {
                        obj: tag_callee_object,
                        prop: MemberProp::Ident(tag_callee_property),
                        ..
                    }) = &**callee
                    {
                        if let Expr::Ident(tag_callee_object) = &**tag_callee_object {
                            if tag_callee_property.sym == js_word!("default")
                                && tag_callee_object.to_id() == import_local_name
                            {
                                return true;
                            }
                        }
                    }
                }

                _ => {}
            }
        }

        false
    }

    pub(crate) fn import_local_name(
        &self,
        name: &str,
        cache_identifier: Option<&Ident>,
    ) -> Option<Id> {
        if name == "default" {
            if let Some(cached) = self.imported_local_name.clone() {
                return Some(cached);
            }
            if let Some(cached) = self.imported_local_ns.clone() {
                return Some(cached);
            }
        }

        if let Some(..) = self.imported_local_ns {
            return Some((name.into(), Default::default()));
        }

        let cache_key = cache_identifier.map(|i| i.to_id()).unwrap_or_default();

        let ctxt = self.unresolved_ctxt.unwrap_or_default();

        let local_name = if self.styled_required.is_some() {
            Some(if name == "default" {
                "styled".into()
            } else {
                name.into()
            })
        } else {
            None
        };

        if let Some(cached) = self.import_name_cache.borrow().get(&cache_key) {
            return Some(cached.clone());
        }

        let name = local_name.map(|word| (word, ctxt));

        if let Some(name) = name.clone() {
            self.import_name_cache.borrow_mut().insert(cache_key, name);
        }

        name
    }

    pub(crate) fn set_import_name(&mut self, id: Id) {
        self.imported_local_name = Some(id);
    }

    fn is_helper(&self, e: &Expr) -> bool {
        self.is_create_global_style_helper(e)
            || self.is_css_helper(e)
            || self.is_inject_global_helper(e)
            || self.is_use_theme(e)
            || self.is_keyframes_helper(e)
            || self.is_with_theme_helper(e)
    }

    fn is_css_helper(&self, e: &Expr) -> bool {
        match e {
            Expr::Ident(e) => Some(e.to_id()) == self.import_local_name("css", None),
            _ => false,
        }
    }

    fn is_create_global_style_helper(&self, e: &Expr) -> bool {
        match e {
            Expr::Ident(e) => Some(e.to_id()) == self.import_local_name("createGlobalStyle", None),
            _ => false,
        }
    }

    fn is_inject_global_helper(&self, e: &Expr) -> bool {
        match e {
            Expr::Ident(e) => Some(e.to_id()) == self.import_local_name("injectGlobal", None),
            _ => false,
        }
    }

    fn is_keyframes_helper(&self, e: &Expr) -> bool {
        match e {
            Expr::Ident(e) => Some(e.to_id()) == self.import_local_name("keyframes", None),
            _ => false,
        }
    }

    fn is_with_theme_helper(&self, e: &Expr) -> bool {
        match e {
            Expr::Ident(e) => Some(e.to_id()) == self.import_local_name("withTheme", None),
            _ => false,
        }
    }

    fn is_use_theme(&self, e: &Expr) -> bool {
        match e {
            Expr::Ident(e) => Some(e.to_id()) == self.import_local_name("useTheme", None),
            _ => false,
        }
    }
}

pub fn prefix_leading_digit(s: &str) -> Cow<str> {
    if s.chars().next().map(|c| c.is_digit(10)).unwrap_or(false) {
        Cow::Owned(format!("sc-{}", s))
    } else {
        Cow::Borrowed(s)
    }
}
