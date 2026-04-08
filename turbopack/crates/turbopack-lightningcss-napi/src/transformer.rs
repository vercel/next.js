use std::{
    marker::PhantomData,
    ops::{Index, IndexMut},
};

use lightningcss::{
    media_query::MediaFeatureValue,
    properties::{
        Property,
        custom::{Token, TokenList, TokenOrValue},
    },
    rules::{CssRule, CssRuleList},
    stylesheet::{ParserOptions, StyleSheet},
    traits::{IntoOwned, ParseWithOptions},
    values::{
        ident::Ident,
        length::{Length, LengthValue},
        string::CowArcStr,
    },
    visitor::{Visit, VisitTypes, Visitor},
};
use napi::{Env, JsFunction, JsObject, JsUnknown, Ref, ValueType};
use serde::{Deserialize, Serialize};
use smallvec::SmallVec;

use crate::{at_rule_parser::AtRule, utils::get_named_property};

pub struct JsVisitor {
    env: Env,
    visit_stylesheet: VisitorsRef,
    visit_rule: VisitorsRef,
    rule_map: VisitorsRef,
    property_map: VisitorsRef,
    visit_declaration: VisitorsRef,
    visit_length: Option<Ref<()>>,
    visit_angle: Option<Ref<()>>,
    visit_ratio: Option<Ref<()>>,
    visit_resolution: Option<Ref<()>>,
    visit_time: Option<Ref<()>>,
    visit_color: Option<Ref<()>>,
    visit_image: VisitorsRef,
    visit_url: Option<Ref<()>>,
    visit_media_query: VisitorsRef,
    visit_supports_condition: VisitorsRef,
    visit_custom_ident: Option<Ref<()>>,
    visit_dashed_ident: Option<Ref<()>>,
    visit_selector: Option<Ref<()>>,
    visit_token: VisitorsRef,
    token_map: VisitorsRef,
    visit_function: VisitorsRef,
    function_map: VisitorsRef,
    visit_variable: VisitorsRef,
    visit_env: VisitorsRef,
    env_map: VisitorsRef,
    types: VisitTypes,
}

// This is so that the visitor can work with bundleAsync.
// We ensure that we only call JsVisitor from the main JS thread.
unsafe impl Send for JsVisitor {}

#[derive(PartialEq, Eq, Clone, Copy)]
enum VisitStage {
    Enter,
    Exit,
}

type VisitorsRef = Visitors<Ref<()>>;

struct Visitors<T> {
    enter: Option<T>,
    exit: Option<T>,
}

impl<T> Visitors<T> {
    fn new(enter: Option<T>, exit: Option<T>) -> Self {
        Self { enter, exit }
    }

    fn for_stage(&self, stage: VisitStage) -> Option<&T> {
        match stage {
            VisitStage::Enter => self.enter.as_ref(),
            VisitStage::Exit => self.exit.as_ref(),
        }
    }
}

impl Visitors<Ref<()>> {
    fn get<U: napi::NapiValue>(&self, env: &Env) -> Visitors<U> {
        Visitors {
            enter: self
                .enter
                .as_ref()
                .and_then(|p| env.get_reference_value_unchecked(p).ok()),
            exit: self
                .exit
                .as_ref()
                .and_then(|p| env.get_reference_value_unchecked(p).ok()),
        }
    }
}

impl Visitors<JsObject> {
    fn named(&self, stage: VisitStage, name: &str) -> Option<JsFunction> {
        self.for_stage(stage)
            .and_then(|m| get_named_property::<JsFunction>(m, name).ok())
    }

    fn custom(&self, stage: VisitStage, obj: &str, name: &str) -> Option<JsFunction> {
        self.for_stage(stage)
            .and_then(|m| m.get_named_property::<JsUnknown>(obj).ok())
            .and_then(|v| {
                match v.get_type() {
                    Ok(ValueType::Function) => return v.try_into().ok(),
                    Ok(ValueType::Object) => {
                        let o: napi::Result<JsObject> = v.try_into();
                        if let Ok(o) = o {
                            return get_named_property::<JsFunction>(&o, name).ok();
                        }
                    }
                    _ => {}
                }

                None
            })
    }
}

impl Drop for JsVisitor {
    fn drop(&mut self) {
        macro_rules! drop {
            ($id: ident) => {
                if let Some(v) = &mut self.$id {
                    drop(v.unref(self.env));
                }
            };
        }

        macro_rules! drop_tuple {
            ($id: ident) => {
                if let Some(v) = &mut self.$id.enter {
                    drop(v.unref(self.env));
                }
                if let Some(v) = &mut self.$id.exit {
                    drop(v.unref(self.env));
                }
            };
        }

        drop_tuple!(visit_stylesheet);
        drop_tuple!(visit_rule);
        drop_tuple!(rule_map);
        drop_tuple!(visit_declaration);
        drop_tuple!(property_map);
        drop!(visit_length);
        drop!(visit_angle);
        drop!(visit_ratio);
        drop!(visit_resolution);
        drop!(visit_time);
        drop!(visit_color);
        drop_tuple!(visit_image);
        drop!(visit_url);
        drop_tuple!(visit_media_query);
        drop_tuple!(visit_supports_condition);
        drop_tuple!(visit_variable);
        drop_tuple!(visit_env);
        drop_tuple!(env_map);
        drop!(visit_custom_ident);
        drop!(visit_dashed_ident);
        drop_tuple!(visit_function);
        drop_tuple!(function_map);
        drop!(visit_selector);
        drop_tuple!(visit_token);
        drop_tuple!(token_map);
    }
}

impl JsVisitor {
    pub fn new(env: Env, visitor: JsObject) -> Self {
        let mut types = VisitTypes::empty();
        macro_rules! get {
      ($name: literal, $( $t: ident )|+) => {{
        let res: Option<JsFunction> = get_named_property(&visitor, $name).ok();

        if res.is_some() {
          types |= $( VisitTypes::$t )|+;
        }

        // We must create a reference so that the garbage collector doesn't destroy
        // the function before we try to call it (in the async bundle case).
        res.and_then(|res| env.create_reference(res).ok())
      }};
    }

        macro_rules! map {
      ($name: literal, $( $t: ident )|+) => {{
        let obj: Option<JsObject> = get_named_property(&visitor, $name).ok();

        if obj.is_some() {
          types |= $( VisitTypes::$t )|+;
        }

        obj.and_then(|obj| env.create_reference(obj).ok())
      }};
    }

        Self {
            env,
            visit_stylesheet: VisitorsRef::new(
                get!("StyleSheet", RULES),
                get!("StyleSheetExit", RULES),
            ),
            visit_rule: VisitorsRef::new(get!("Rule", RULES), get!("RuleExit", RULES)),
            rule_map: VisitorsRef::new(map!("Rule", RULES), get!("RuleExit", RULES)),
            visit_declaration: VisitorsRef::new(
                get!("Declaration", PROPERTIES),
                get!("DeclarationExit", PROPERTIES),
            ),
            property_map: VisitorsRef::new(
                map!("Declaration", PROPERTIES),
                map!("DeclarationExit", PROPERTIES),
            ),
            visit_length: get!("Length", LENGTHS),
            visit_angle: get!("Angle", ANGLES),
            visit_ratio: get!("Ratio", RATIOS),
            visit_resolution: get!("Resolution", RESOLUTIONS),
            visit_time: get!("Time", TIMES),
            visit_color: get!("Color", COLORS),
            visit_image: VisitorsRef::new(get!("Image", IMAGES), get!("ImageExit", IMAGES)),
            visit_url: get!("Url", URLS),
            visit_media_query: VisitorsRef::new(
                get!("MediaQuery", MEDIA_QUERIES),
                get!("MediaQueryExit", MEDIA_QUERIES),
            ),
            visit_supports_condition: VisitorsRef::new(
                get!("SupportsCondition", SUPPORTS_CONDITIONS),
                get!("SupportsConditionExit", SUPPORTS_CONDITIONS),
            ),
            visit_variable: VisitorsRef::new(
                get!("Variable", TOKENS),
                get!("VariableExit", TOKENS),
            ),
            visit_env: VisitorsRef::new(
                get!(
                    "EnvironmentVariable",
                    TOKENS | MEDIA_QUERIES | ENVIRONMENT_VARIABLES
                ),
                get!(
                    "EnvironmentVariableExit",
                    TOKENS | MEDIA_QUERIES | ENVIRONMENT_VARIABLES
                ),
            ),
            env_map: VisitorsRef::new(
                map!(
                    "EnvironmentVariable",
                    TOKENS | MEDIA_QUERIES | ENVIRONMENT_VARIABLES
                ),
                map!(
                    "EnvironmentVariableExit",
                    TOKENS | MEDIA_QUERIES | ENVIRONMENT_VARIABLES
                ),
            ),
            visit_custom_ident: get!("CustomIdent", CUSTOM_IDENTS),
            visit_dashed_ident: get!("DashedIdent", DASHED_IDENTS),
            visit_function: VisitorsRef::new(
                get!("Function", TOKENS),
                get!("FunctionExit", TOKENS),
            ),
            function_map: VisitorsRef::new(map!("Function", TOKENS), map!("FunctionExit", TOKENS)),
            visit_selector: get!("Selector", SELECTORS),
            visit_token: VisitorsRef::new(get!("Token", TOKENS), None),
            token_map: VisitorsRef::new(map!("Token", TOKENS), None),
            types,
        }
    }
}

impl<'i> Visitor<'i, AtRule<'i>> for JsVisitor {
    type Error = napi::Error;

    fn visit_types(&self) -> VisitTypes {
        self.types
    }

    fn visit_stylesheet<'o>(
        &mut self,
        stylesheet: &mut StyleSheet<'i, 'o, AtRule<'i>>,
    ) -> Result<(), Self::Error> {
        if self.types.contains(VisitTypes::RULES) {
            let env = self.env;
            let visit_stylesheet = self.visit_stylesheet.get::<JsFunction>(&env);
            if let Some(visit) = visit_stylesheet.for_stage(VisitStage::Enter) {
                call_visitor(&env, stylesheet, visit)?
            }

            stylesheet.visit_children(self)?;

            if let Some(visit) = visit_stylesheet.for_stage(VisitStage::Exit) {
                call_visitor(&env, stylesheet, visit)?
            }

            Ok(())
        } else {
            stylesheet.visit_children(self)
        }
    }

    fn visit_rule_list(
        &mut self,
        rules: &mut lightningcss::rules::CssRuleList<'i, AtRule<'i>>,
    ) -> Result<(), Self::Error> {
        if self.types.contains(VisitTypes::RULES) {
            let env = self.env;
            let rule_map = self.rule_map.get::<JsObject>(&env);
            let visit_rule = self.visit_rule.get::<JsFunction>(&env);

            visit_list(
                rules,
                |value, stage| {
                    // Use a more specific visitor function if available, but fall back to
                    // visit_rule.
                    let name = match value {
                        CssRule::Media(..) => "media",
                        CssRule::Import(..) => "import",
                        CssRule::Style(..) => "style",
                        CssRule::Keyframes(..) => "keyframes",
                        CssRule::FontFace(..) => "font-face",
                        CssRule::FontPaletteValues(..) => "font-palette-values",
                        CssRule::FontFeatureValues(..) => "font-feature-values",
                        CssRule::Page(..) => "page",
                        CssRule::Supports(..) => "supports",
                        CssRule::CounterStyle(..) => "counter-style",
                        CssRule::Namespace(..) => "namespace",
                        CssRule::CustomMedia(..) => "custom-media",
                        CssRule::LayerBlock(..) => "layer-block",
                        CssRule::LayerStatement(..) => "layer-statement",
                        CssRule::Property(..) => "property",
                        CssRule::Container(..) => "container",
                        CssRule::Scope(..) => "scope",
                        CssRule::MozDocument(..) => "moz-document",
                        CssRule::Nesting(..) => "nesting",
                        CssRule::NestedDeclarations(..) => "nested-declarations",
                        CssRule::Viewport(..) => "viewport",
                        CssRule::StartingStyle(..) => "starting-style",
                        CssRule::ViewTransition(..) => "view-transition",
                        CssRule::Unknown(v) => {
                            let name = v.name.as_ref();
                            if let Some(visit) = rule_map.custom(stage, "unknown", name) {
                                let js_value = env.to_js_value(v)?;
                                let res = visit.call(None, &[js_value])?;
                                return env.from_js_value(res).map(serde_detach::detach);
                            } else {
                                "unknown"
                            }
                        }
                        CssRule::Custom(c) => {
                            let name = c.name.as_ref();
                            if let Some(visit) = rule_map.custom(stage, "custom", name) {
                                let js_value = env.to_js_value(c)?;
                                let res = visit.call(None, &[js_value])?;
                                return env.from_js_value(res).map(serde_detach::detach);
                            } else {
                                "custom"
                            }
                        }
                        CssRule::Ignored => return Ok(None),
                    };

                    if let Some(visit) = rule_map
                        .named(stage, name)
                        .as_ref()
                        .or(visit_rule.for_stage(stage))
                    {
                        let js_value = env.to_js_value(value)?;
                        let res = visit.call(None, &[js_value])?;
                        env.from_js_value(res).map(serde_detach::detach)
                    } else {
                        Ok(None)
                    }
                },
                |rule| rule.visit_children(self),
            )?;

            Ok(())
        } else {
            rules.visit_children(self)
        }
    }

    fn visit_declaration_block(
        &mut self,
        decls: &mut lightningcss::declaration::DeclarationBlock<'i>,
    ) -> Result<(), Self::Error> {
        if self.types.contains(VisitTypes::PROPERTIES) {
            let env = self.env;
            let property_map = self.property_map.get::<JsObject>(&env);
            let visit_declaration = self.visit_declaration.get::<JsFunction>(&env);
            visit_declaration_list(
                &env,
                &mut decls.important_declarations,
                &visit_declaration,
                &property_map,
                |property| property.visit_children(self),
            )?;
            visit_declaration_list(
                &env,
                &mut decls.declarations,
                &visit_declaration,
                &property_map,
                |property| property.visit_children(self),
            )?;
            Ok(())
        } else {
            decls.visit_children(self)
        }
    }

    fn visit_length(&mut self, length: &mut LengthValue) -> Result<(), Self::Error> {
        visit(&self.env, length, &self.visit_length)
    }

    fn visit_angle(
        &mut self,
        angle: &mut lightningcss::values::angle::Angle,
    ) -> Result<(), Self::Error> {
        visit(&self.env, angle, &self.visit_angle)
    }

    fn visit_ratio(
        &mut self,
        ratio: &mut lightningcss::values::ratio::Ratio,
    ) -> Result<(), Self::Error> {
        visit(&self.env, ratio, &self.visit_ratio)
    }

    fn visit_resolution(
        &mut self,
        resolution: &mut lightningcss::values::resolution::Resolution,
    ) -> Result<(), Self::Error> {
        visit(&self.env, resolution, &self.visit_resolution)
    }

    fn visit_time(
        &mut self,
        time: &mut lightningcss::values::time::Time,
    ) -> Result<(), Self::Error> {
        visit(&self.env, time, &self.visit_time)
    }

    fn visit_color(
        &mut self,
        color: &mut lightningcss::values::color::CssColor,
    ) -> Result<(), Self::Error> {
        visit(&self.env, color, &self.visit_color)
    }

    fn visit_image(
        &mut self,
        image: &mut lightningcss::values::image::Image<'i>,
    ) -> Result<(), Self::Error> {
        visit(&self.env, image, &self.visit_image.enter)?;
        image.visit_children(self)?;
        visit(&self.env, image, &self.visit_image.exit)
    }

    fn visit_url(
        &mut self,
        url: &mut lightningcss::values::url::Url<'i>,
    ) -> Result<(), Self::Error> {
        visit(&self.env, url, &self.visit_url)
    }

    fn visit_media_list(
        &mut self,
        media: &mut lightningcss::media_query::MediaList<'i>,
    ) -> Result<(), Self::Error> {
        if self.types.contains(VisitTypes::MEDIA_QUERIES) {
            let env = self.env;
            let visit_media_query = self.visit_media_query.get::<JsFunction>(&env);
            visit_list(
                &mut media.media_queries,
                |value, stage| {
                    if let Some(visit) = visit_media_query.for_stage(stage) {
                        let js_value = env.to_js_value(value)?;
                        let res = visit.call(None, &[js_value])?;
                        env.from_js_value(res).map(serde_detach::detach)
                    } else {
                        Ok(None)
                    }
                },
                |q| q.visit_children(self),
            )?;
            Ok(())
        } else {
            media.visit_children(self)
        }
    }

    fn visit_media_feature_value(
        &mut self,
        value: &mut MediaFeatureValue<'i>,
    ) -> Result<(), Self::Error> {
        if self.types.contains(VisitTypes::ENVIRONMENT_VARIABLES)
            && matches!(value, MediaFeatureValue::Env(_))
        {
            let env_map = self.env_map.get::<JsObject>(&self.env);
            let visit_env = self.visit_env.get::<JsFunction>(&self.env);
            let call = |stage: VisitStage,
                        value: &mut MediaFeatureValue,
                        env: &Env|
             -> napi::Result<()> {
                let env_var = if let MediaFeatureValue::Env(env) = value {
                    env
                } else {
                    return Ok(());
                };
                let visit_type = env_map.named(stage, env_var.name.name());
                let visit = visit_env.for_stage(stage);
                let new_value: Option<TokenOrValue> =
                    if let Some(visit) = visit_type.as_ref().or(visit) {
                        let js_value = env.to_js_value(env_var)?;
                        let res = visit.call(None, &[js_value])?;
                        env.from_js_value(res).map(serde_detach::detach)?
                    } else {
                        None
                    };

                match new_value {
                    None => return Ok(()),
                    Some(TokenOrValue::Length(l)) => {
                        *value = MediaFeatureValue::Length(Length::Value(l))
                    }
                    Some(TokenOrValue::Resolution(r)) => *value = MediaFeatureValue::Resolution(r),
                    Some(TokenOrValue::Token(Token::Number { value: n, .. })) => {
                        *value = MediaFeatureValue::Number(n)
                    }
                    Some(TokenOrValue::Token(Token::Ident(ident))) => {
                        *value = MediaFeatureValue::Ident(Ident(ident))
                    }
                    // TODO: ratio
                    _ => {
                        return Err(napi::Error::new(
                            napi::Status::InvalidArg,
                            format!("invalid environment value in media query: {:?}", new_value),
                        ));
                    }
                }

                Ok(())
            };

            call(VisitStage::Enter, value, &self.env)?;
            value.visit_children(self)?;
            call(VisitStage::Exit, value, &self.env)?;
            return Ok(());
        }

        value.visit_children(self)
    }

    fn visit_supports_condition(
        &mut self,
        condition: &mut lightningcss::rules::supports::SupportsCondition<'i>,
    ) -> Result<(), Self::Error> {
        visit(&self.env, condition, &self.visit_supports_condition.enter)?;
        condition.visit_children(self)?;
        visit(&self.env, condition, &self.visit_supports_condition.exit)
    }

    fn visit_custom_ident(
        &mut self,
        ident: &mut lightningcss::values::ident::CustomIdent,
    ) -> Result<(), Self::Error> {
        visit(&self.env, ident, &self.visit_custom_ident)
    }

    fn visit_dashed_ident(
        &mut self,
        ident: &mut lightningcss::values::ident::DashedIdent,
    ) -> Result<(), Self::Error> {
        visit(&self.env, ident, &self.visit_dashed_ident)
    }

    fn visit_selector_list(
        &mut self,
        selectors: &mut lightningcss::selector::SelectorList<'i>,
    ) -> Result<(), Self::Error> {
        if let Some(visit) = self
            .visit_selector
            .as_ref()
            .and_then(|v| self.env.get_reference_value_unchecked::<JsFunction>(v).ok())
        {
            map::<_, _, _, true>(&mut selectors.0, |value| {
                let js_value = self.env.to_js_value(value)?;
                let res = visit.call(None, &[js_value])?;
                self.env.from_js_value(res).map(serde_detach::detach)
            })?;
        }

        Ok(())
    }

    fn visit_token_list(
        &mut self,
        tokens: &mut lightningcss::properties::custom::TokenList<'i>,
    ) -> Result<(), Self::Error> {
        if self.types.contains(VisitTypes::TOKENS) {
            let env = self.env;
            let visit_token = self.visit_token.get::<JsFunction>(&env);
            let token_map = self.token_map.get::<JsObject>(&env);
            let visit_function = self.visit_function.get::<JsFunction>(&env);
            let function_map = self.function_map.get::<JsObject>(&env);
            let visit_variable = self.visit_variable.get::<JsFunction>(&env);
            let visit_env = self.visit_env.get::<JsFunction>(&env);
            let env_map = self.env_map.get::<JsObject>(&env);

            visit_list(
                &mut tokens.0,
                |value, stage| {
                    let (visit_type, visit) = match value {
                        TokenOrValue::Function(f) => (
                            function_map.named(stage, f.name.0.as_ref()),
                            visit_function.for_stage(stage),
                        ),
                        TokenOrValue::Var(_) => (None, visit_variable.for_stage(stage)),
                        TokenOrValue::Env(e) => (
                            env_map.named(stage, e.name.name()),
                            visit_env.for_stage(stage),
                        ),
                        TokenOrValue::Token(t) => {
                            let name = match t {
                                Token::Ident(_) => Some("ident"),
                                Token::AtKeyword(_) => Some("at-keyword"),
                                Token::Hash(_) => Some("hash"),
                                Token::IDHash(_) => Some("id-hash"),
                                Token::String(_) => Some("string"),
                                Token::Number { .. } => Some("number"),
                                Token::Percentage { .. } => Some("percentage"),
                                Token::Dimension { .. } => Some("dimension"),
                                _ => None,
                            };
                            let visit = if let Some(name) = name {
                                token_map.named(stage, name)
                            } else {
                                None
                            };
                            (visit, visit_token.for_stage(stage))
                        }
                        _ => return Ok(None),
                    };

                    if let Some(visit) = visit_type.as_ref().or(visit) {
                        let js_value = match value {
                            TokenOrValue::Function(f) => env.to_js_value(f)?,
                            TokenOrValue::Var(v) => env.to_js_value(v)?,
                            TokenOrValue::Env(v) => env.to_js_value(v)?,
                            TokenOrValue::Token(t) => env.to_js_value(t)?,
                            _ => unreachable!(),
                        };

                        let res = visit.call(None, &[js_value])?;
                        let res: Option<TokensOrRaw> =
                            env.from_js_value(res).map(serde_detach::detach)?;
                        Ok(res.map(|r| r.0))
                    } else {
                        Ok(None)
                    }
                },
                |value| value.visit_children(self),
            )?;

            Ok(())
        } else {
            tokens.visit_children(self)
        }
    }
}

fn visit<V: Serialize + Deserialize<'static>>(
    env: &Env,
    value: &mut V,
    visit: &Option<Ref<()>>,
) -> napi::Result<()> {
    if let Some(visit) = visit
        .as_ref()
        .and_then(|v| env.get_reference_value_unchecked::<JsFunction>(v).ok())
    {
        call_visitor(env, value, &visit)?;
    }

    Ok(())
}

fn call_visitor<V: Serialize + Deserialize<'static>>(
    env: &Env,
    value: &mut V,
    visit: &JsFunction,
) -> napi::Result<()> {
    let js_value = env.to_js_value(value)?;
    let res = visit.call(None, &[js_value])?;
    let new_value: Option<V> = env.from_js_value(res).map(serde_detach::detach)?;
    match new_value {
        Some(new_value) => *value = new_value,
        None => {}
    }

    Ok(())
}

fn visit_declaration_list<'i, C: FnMut(&mut Property<'i>) -> napi::Result<()>>(
    env: &Env,
    list: &mut Vec<Property<'i>>,
    visit_declaration: &Visitors<JsFunction>,
    property_map: &Visitors<JsObject>,
    visit_children: C,
) -> napi::Result<()> {
    visit_list(
        list,
        |value, stage| {
            // Use a specific property visitor if available, or fall back to Property visitor.
            let visit = match value {
                Property::Custom(v) => {
                    if let Some(visit) = property_map.custom(stage, "custom", v.name.as_ref()) {
                        let js_value = env.to_js_value(v)?;
                        let res = visit.call(None, &[js_value])?;
                        return env.from_js_value(res).map(serde_detach::detach);
                    } else {
                        None
                    }
                }
                _ => property_map.named(stage, value.property_id().name()),
            };

            if let Some(visit) = visit.as_ref().or(visit_declaration.for_stage(stage)) {
                let js_value = env.to_js_value(value)?;
                let res = visit.call(None, &[js_value])?;
                env.from_js_value(res).map(serde_detach::detach)
            } else {
                Ok(None)
            }
        },
        visit_children,
    )
}

fn visit_list<
    V,
    L: List<V>,
    F: Fn(&mut V, VisitStage) -> napi::Result<Option<ValueOrVec<V>>>,
    C: FnMut(&mut V) -> napi::Result<()>,
>(
    list: &mut L,
    visit: F,
    mut visit_children: C,
) -> napi::Result<()> {
    map(list, |value| {
        let mut new_value: Option<ValueOrVec<V>> = visit(value, VisitStage::Enter)?;

        match &mut new_value {
            Some(ValueOrVec::Value(v)) => {
                visit_children(v)?;

                if let Some(val) = visit(v, VisitStage::Exit)? {
                    new_value = Some(val);
                }
            }
            Some(ValueOrVec::Vec(v)) => {
                map(v, |value| {
                    visit_children(value)?;
                    visit(value, VisitStage::Exit)
                })?;
            }
            None => {
                visit_children(value)?;
                if let Some(val) = visit(value, VisitStage::Exit)? {
                    new_value = Some(val);
                }
            }
        }

        Ok(new_value)
    })
}

fn map<
    V,
    L: List<V>,
    F: FnMut(&mut V) -> napi::Result<Option<ValueOrVec<V, IS_VEC>>>,
    const IS_VEC: bool,
>(
    list: &mut L,
    mut f: F,
) -> napi::Result<()> {
    let mut i = 0;
    while i < list.len() {
        let value = &mut list[i];
        let new_value = f(value)?;
        match new_value {
            Some(ValueOrVec::Value(v)) => {
                list[i] = v;
                i += 1;
            }
            Some(ValueOrVec::Vec(vec)) => {
                if vec.is_empty() {
                    list.remove(i);
                } else {
                    let len = vec.len();
                    list.replace(i, vec);
                    i += len;
                }
            }
            None => {
                i += 1;
            }
        }
    }
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(untagged)]
enum ValueOrVec<V, const IS_VEC: bool = false> {
    Value(V),
    Vec(Vec<V>),
}

// Manually implemented deserialize for better error messages.
// https://github.com/serde-rs/serde/issues/773
impl<'de, V: serde::Deserialize<'de>, const IS_VEC: bool> serde::Deserialize<'de>
    for ValueOrVec<V, IS_VEC>
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        use serde::Deserializer;
        let content = serde_content::Value::deserialize(deserializer)?;
        let de = serde_content::Deserializer::new(content.clone()).coerce_numbers();

        // Try to deserialize as a sequence first.
        let mut was_seq = false;
        let res = de.deserialize_seq(SeqVisitor {
            was_seq: &mut was_seq,
            phantom: PhantomData,
        });

        if was_seq {
            // Allow fallback if we know the value is also a list (e.g. selector).
            if res.is_ok() || !IS_VEC {
                return res
                    .map_err(|e| serde::de::Error::custom(e.to_string()))
                    .map(ValueOrVec::Vec);
            }
        }

        // If it wasn't a sequence, try a value.
        let de = serde_content::Deserializer::new(content).coerce_numbers();
        return V::deserialize(de)
            .map_err(|e| serde::de::Error::custom(e.to_string()))
            .map(ValueOrVec::Value);

        struct SeqVisitor<'a, V> {
            was_seq: &'a mut bool,
            phantom: PhantomData<V>,
        }

        impl<'a, 'de, V: serde::Deserialize<'de>> serde::de::Visitor<'de> for SeqVisitor<'a, V> {
            type Value = Vec<V>;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a sequence")
            }

            fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
            where
                A: serde::de::SeqAccess<'de>,
            {
                *self.was_seq = true;
                let mut vec = Vec::with_capacity(seq.size_hint().unwrap_or(1));
                while let Some(v) = seq.next_element()? {
                    vec.push(v);
                }
                Ok(vec)
            }
        }
    }
}

struct TokensOrRaw<'i>(ValueOrVec<TokenOrValue<'i>>);

impl<'i, 'de: 'i> serde::Deserialize<'de> for TokensOrRaw<'i> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(serde::Deserialize)]
        struct Raw<'i> {
            #[serde(borrow)]
            raw: CowArcStr<'i>,
        }

        let content = serde_content::Value::deserialize(deserializer)?;
        let de = serde_content::Deserializer::new(content.clone()).coerce_numbers();

        if let Ok(res) = Raw::deserialize(de) {
            let res =
                TokenList::parse_string_with_options(res.raw.as_ref(), ParserOptions::default())
                    .map_err(|_| serde::de::Error::custom("Could not parse value"))?;
            return Ok(TokensOrRaw(ValueOrVec::Vec(res.into_owned().0)));
        }

        let de = serde_content::Deserializer::new(content).coerce_numbers();
        Ok(TokensOrRaw(
            ValueOrVec::deserialize(de).map_err(|e| serde::de::Error::custom(e.to_string()))?,
        ))
    }
}

trait List<V>: Index<usize, Output = V> + IndexMut<usize, Output = V> {
    fn len(&self) -> usize;
    fn remove(&mut self, i: usize);
    fn replace(&mut self, i: usize, items: Vec<V>);
}

impl<V> List<V> for Vec<V> {
    fn len(&self) -> usize {
        Vec::len(self)
    }

    fn remove(&mut self, i: usize) {
        Vec::remove(self, i);
    }

    fn replace(&mut self, i: usize, items: Vec<V>) {
        self.splice(i..i + 1, items);
    }
}

impl<V, T: smallvec::Array<Item = V>> List<V> for SmallVec<T> {
    fn len(&self) -> usize {
        SmallVec::len(self)
    }

    fn remove(&mut self, i: usize) {
        SmallVec::remove(self, i);
    }

    fn replace(&mut self, i: usize, items: Vec<V>) {
        let len = items.len();
        let mut iter = items.into_iter();
        self[i] = iter.next().unwrap();
        if len > 1 {
            self.insert_many(i + 1, iter);
        }
    }
}

impl<'i, R> List<CssRule<'i, R>> for CssRuleList<'i, R> {
    fn len(&self) -> usize {
        self.0.len()
    }

    fn remove(&mut self, i: usize) {
        self[i] = CssRule::Ignored;
    }

    fn replace(&mut self, i: usize, items: Vec<CssRule<'i, R>>) {
        self.0.replace(i, items)
    }
}
