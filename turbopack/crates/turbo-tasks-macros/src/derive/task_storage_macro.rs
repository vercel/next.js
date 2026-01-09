use proc_macro::TokenStream;
use quote::quote;
use syn::{
    Data, DeriveInput, Fields, Ident, Meta, Token, Type, parse_macro_input, punctuated::Punctuated,
    spanned::Spanned,
};

/// Derives the TaskStorage trait and generates optimized storage structures.
///
/// This macro analyzes field annotations and generates:
/// 1. A unified TaskStorage struct
/// 2. LazyField enum for lazy_vec fields
/// 3. Typed accessor methods on TaskStorage
/// 4. TaskStorageAccessors trait with accessor methods
/// 5. TaskFlags bitfield for boolean flags
///
/// # Field Attributes
///
/// All fields require two attributes:
///
/// ## `storage = "..."` (required)
///
/// Specifies how the field is stored:
/// - `direct` - Direct field access (e.g., `Option<OutputValue>`)
/// - `auto_set` - Uses AutoSet for small collections
/// - `auto_map` - Uses AutoMap for key-value pairs
/// - `auto_multimap` - Uses AutoMultimap for key -> set-of-values
/// - `counter_map` - Uses CounterMap for reference counting
/// - `flag` - Boolean flag stored in a compact TaskFlags bitfield (field type must be `bool`)
///
/// ## `category = "..."` (required)
///
/// Specifies the data category for persistence and access:
/// - `data` - Frequently changed, bulk I/O
/// - `meta` - Rarely changed, small I/O
/// - `transient` - Field is not serialized (in-memory only)
///
/// ## Optional Modifiers
///
/// - `inline` - Field is stored inline on TaskStorage (default is lazy). Only use for hot-path
///   fields that are frequently accessed.
/// - `default` - Use `Default::default()` semantics instead of `Option` for inline direct fields.
/// - `filter_transient` - Filter out transient values during serialization. For AutoMultimap
///   fields, transient filtering is always applied to inner set values automatically.
pub fn derive_task_storage(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as DeriveInput);

    match &input.data {
        Data::Struct(data_struct) => {
            let ident = &input.ident;

            // Parse field annotations
            let storage_fields = match &data_struct.fields {
                Fields::Named(fields) => fields
                    .named
                    .iter()
                    .map(parse_field_storage_attributes)
                    .collect::<Vec<_>>(),
                _ => {
                    return syn::Error::new(
                        input.span(),
                        "TaskStorage can only be derived for structs with named fields",
                    )
                    .to_compile_error()
                    .into();
                }
            };

            // Create grouped fields container
            let grouped_fields = GroupedFields::new(storage_fields);

            // Generate the implementation
            generate_task_storage_impl(ident, &grouped_fields)
        }
        _ => syn::Error::new(input.span(), "TaskStorage can only be derived for structs")
            .to_compile_error()
            .into(),
    }
}

/// Parsed field information with cached derived values.
///
/// This struct holds all information about a field extracted from its attributes,
/// along with pre-computed values like the PascalCase variant name.
#[derive(Debug, Clone)]
struct FieldInfo {
    /// The field's identifier (snake_case)
    field_name: Ident,
    /// The PascalCase variant name for use in LazyField enum
    variant_name: Ident,
    field_type: Type,
    storage_type: StorageType,
    category: Category,
    /// If true, field is lazily allocated in Vec<LazyField> (the default).
    /// If false (marked with `inline`), field is stored directly on TaskStorage.
    lazy: bool,
    /// If true, filter out values that reference transient tasks during encoding.
    /// For direct fields: skip encoding if value.is_transient() returns true.
    /// For collections: filter out entries where key/value is_transient() returns true.
    /// For AutoMultimap: filter is always applied to inner set values automatically.
    filter_transient: bool,
    /// If true, use Default::default() semantics instead of Option for inline direct fields.
    /// The field type should be T (not Option<T>), and empty is represented by T::default().
    use_default: bool,
}

impl FieldInfo {
    /// Whether this field is a boolean flag stored in the TaskFlags bitfield.
    fn is_flag(&self) -> bool {
        self.storage_type == StorageType::Flag
    }

    /// Whether this field is transient (not serialized, in-memory only).
    fn is_transient(&self) -> bool {
        self.category == Category::Transient
    }

    /// Generate the full `self.check_access(...)` call for this field.
    fn check_access_call(&self) -> proc_macro2::TokenStream {
        if self.is_transient() {
            quote! { self.check_access(crate::backend::TaskDataCategory::All); }
        } else if self.category == Category::Meta {
            quote! { self.check_access(crate::backend::TaskDataCategory::Meta); }
        } else {
            quote! { self.check_access(crate::backend::TaskDataCategory::Data); }
        }
    }

    /// Generate the full `self.track_modification(...)` call for this field.
    fn track_modification_call(&self) -> proc_macro2::TokenStream {
        if self.category == Category::Meta {
            quote! { self.track_modification(crate::backend::storage::SpecificTaskDataCategory::Meta); }
        } else {
            quote! { self.track_modification(crate::backend::storage::SpecificTaskDataCategory::Data); }
        }
    }

    /// Whether this field is stored inline (not lazy).
    fn is_inline(&self) -> bool {
        !self.lazy
    }

    /// Generate expression for immutable collection access.
    ///
    /// Delegates to TaskStorage accessor methods:
    /// - For inline fields: `self.typed().{field_name}()` yields `&T`
    /// - For lazy fields: `self.typed().{field_name}()` yields `Option<&T>`
    ///
    /// Note: This is for collection types (AutoSet, CounterMap, AutoMap), not Direct fields.
    fn collection_ref_expr(&self) -> proc_macro2::TokenStream {
        let field_name = &self.field_name;
        // Both inline and lazy have accessor methods generated on TaskStorage
        quote! { self.typed().#field_name() }
    }

    /// Generate expression for mutable collection access (allocates for lazy fields).
    ///
    /// Delegates to TaskStorage accessor methods:
    /// - For inline fields: `self.typed_mut().{field_name}_mut()` yields `&mut T`
    /// - For lazy fields: `self.typed_mut().{field_name}_mut()` yields `&mut T` (allocates if
    ///   needed)
    ///
    /// Note: This is for collection types (AutoSet, CounterMap, AutoMap), not Direct fields.
    fn collection_mut_expr(&self) -> proc_macro2::TokenStream {
        let field_name_mut = self.mut_ident();
        // Both inline and lazy have accessor methods generated on TaskStorage
        quote! { self.typed_mut().#field_name_mut() }
    }

    /// Whether immutable access returns `Option<&T>` (lazy) vs `&T` (inline).
    ///
    /// This affects how read operations need to handle the result:
    /// - For inline: `collection_ref_expr().get(key)` returns `Option<&V>`
    /// - For lazy: `collection_ref_expr().and_then(|m| m.get(key))` returns `Option<&V>`
    fn is_option_ref(&self) -> bool {
        self.lazy
    }

    // =========================================================================
    // Direct Field Access Helpers
    // =========================================================================

    /// Generate expression to get a Direct field value (returns `Option<&T>`).
    ///
    /// Delegates to TaskStorage accessor method `get_{field}()`.
    fn direct_get_expr(&self) -> proc_macro2::TokenStream {
        let get_name = self.get_ident();
        quote! { self.typed().#get_name() }
    }

    /// Generate expression to set a Direct field value.
    ///
    /// Delegates to TaskStorage accessor method `set_{field}(value)`.
    /// For inline: returns `Option<T>` (old value)
    /// For lazy: returns `()` (no return value from current impl)
    fn direct_set_expr(&self) -> proc_macro2::TokenStream {
        let set_name = self.set_ident();
        quote! { self.typed_mut().#set_name }
    }

    /// Generate expression to take a Direct field value.
    ///
    /// Delegates to TaskStorage accessor method `take_{field}()`.
    fn direct_take_expr(&self) -> proc_macro2::TokenStream {
        let take_name = self.take_ident();
        quote! { self.typed_mut().#take_name() }
    }

    /// Generate expression to get a mutable reference to a Direct field value.
    ///
    /// Delegates to TaskStorage accessor method `get_{field}_mut()`.
    /// Only available for lazy Direct fields (inline fields can use set/take).
    fn direct_get_mut_expr(&self) -> proc_macro2::TokenStream {
        let get_mut_name = self.get_mut_ident();
        quote! { self.typed_mut().#get_mut_name() }
    }

    // =========================================================================
    // TaskStorage Internal Access Helpers
    // These generate expressions for use within TaskStorage impl blocks,
    // operating on `self` directly rather than `self.typed()`.
    // =========================================================================

    /// Generate the find_lazy extractor closure for this lazy field.
    ///
    /// Returns `|f| match f { LazyField::Variant(v) => Some(v), _ => None }`
    fn lazy_extractor_closure(&self) -> proc_macro2::TokenStream {
        let variant_name = &self.variant_name;
        quote! {
            |f| match f {
                LazyField::#variant_name(v) => Some(v),
                _ => None,
            }
        }
    }

    /// Generate the lazy field constructor expression.
    ///
    /// Returns `LazyField::Variant(value)` or `LazyField::Variant(Default::default())`
    fn lazy_constructor(&self, value_expr: proc_macro2::TokenStream) -> proc_macro2::TokenStream {
        let variant_name = &self.variant_name;
        quote! { LazyField::#variant_name(#value_expr) }
    }

    /// Generate the matches! pattern for this lazy field.
    ///
    /// Returns `LazyField::Variant(_)`
    fn lazy_matches_pattern(&self) -> proc_macro2::TokenStream {
        let variant_name = &self.variant_name;
        quote! { LazyField::#variant_name(_) }
    }

    /// Generate a matches closure for get_or_create_lazy.
    ///
    /// Returns `|f| matches!(f, LazyField::Variant(_))`
    fn lazy_matches_closure(&self) -> proc_macro2::TokenStream {
        let variant_name = &self.variant_name;
        quote! {
            |f| matches!(f, LazyField::#variant_name(_))
        }
    }

    /// Generate an unwrap closure for get_or_create_lazy.
    ///
    /// Returns `|f| match f { LazyField::Variant(v) => v, _ => unreachable!() }`
    fn lazy_unwrap_closure(&self) -> proc_macro2::TokenStream {
        let variant_name = &self.variant_name;
        quote! {
            |f| match f {
                LazyField::#variant_name(v) => v,
                _ => unreachable!(),
            }
        }
    }

    // =========================================================================
    // Method Name Helpers
    // Centralized identifier construction for generated method names.
    // =========================================================================

    /// Create an identifier with a prefix: `{prefix}_{field_name}`
    fn prefixed_ident(&self, prefix: &str) -> syn::Ident {
        syn::Ident::new(
            &format!("{}_{}", prefix, self.field_name),
            proc_macro2::Span::call_site(),
        )
    }

    /// Create an identifier with a suffix: `{field_name}_{suffix}`
    fn suffixed_ident(&self, suffix: &str) -> syn::Ident {
        syn::Ident::new(
            &format!("{}_{}", self.field_name, suffix),
            proc_macro2::Span::call_site(),
        )
    }

    /// Create an identifier with infix: `{prefix}_{field_name}_{suffix}`
    fn infixed_ident(&self, prefix: &str, suffix: &str) -> syn::Ident {
        syn::Ident::new(
            &format!("{}_{}_{}", prefix, self.field_name, suffix),
            proc_macro2::Span::call_site(),
        )
    }

    /// Create identifier matching field name (for immutable collection accessors)
    fn ref_ident(&self) -> syn::Ident {
        self.field_name.clone()
    }

    // Convenience methods for common accessor patterns
    fn get_ident(&self) -> syn::Ident {
        self.prefixed_ident("get")
    }
    fn set_ident(&self) -> syn::Ident {
        self.prefixed_ident("set")
    }
    fn take_ident(&self) -> syn::Ident {
        self.prefixed_ident("take")
    }
    fn has_ident(&self) -> syn::Ident {
        self.prefixed_ident("has")
    }
    fn get_mut_ident(&self) -> syn::Ident {
        self.infixed_ident("get", "mut")
    }
    fn mut_ident(&self) -> syn::Ident {
        self.suffixed_ident("mut")
    }
    fn iter_ident(&self) -> syn::Ident {
        self.prefixed_ident("iter")
    }
    fn len_ident(&self) -> syn::Ident {
        self.suffixed_ident("len")
    }
    fn is_empty_ident(&self) -> syn::Ident {
        syn::Ident::new(
            &format!("is_{}_empty", self.field_name),
            proc_macro2::Span::call_site(),
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum StorageType {
    Direct,
    AutoSet,
    AutoMap,
    AutoMultimap,
    CounterMap,
    Flag,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Category {
    Data,
    Meta,
    Transient,
}

fn parse_field_storage_attributes(field: &syn::Field) -> FieldInfo {
    let field_name = field.ident.as_ref().unwrap().clone();
    let field_type = field.ty.clone();

    // Pre-compute the PascalCase variant name once
    let variant_name = syn::Ident::new(&to_pascal_case(&field_name.to_string()), field_name.span());

    // Default values
    let mut storage_type: Option<StorageType> = None;
    let mut category: Option<Category> = None;
    let mut inline = false; // Default is lazy (not inline)
    let mut filter_transient = false;
    let mut use_default = false;

    // Parse attributes
    for attr in &field.attrs {
        if !attr
            .path()
            .get_ident()
            .map(|ident| *ident == "task_storage")
            .unwrap_or_default()
        {
            continue;
        }

        let nested = match attr.parse_args_with(Punctuated::<Meta, Token![,]>::parse_terminated) {
            Ok(punctuated) => punctuated,
            Err(e) => {
                attr.meta
                    .span()
                    .unwrap()
                    .error(format!("failed to parse task_storage attribute: {e}"))
                    .emit();
                continue;
            }
        };

        for meta in nested {
            match &meta {
                Meta::NameValue(nv) => {
                    let Some(ident) = nv.path.get_ident() else {
                        continue;
                    };

                    if *ident == "storage"
                        && let syn::Expr::Lit(syn::ExprLit {
                            lit: syn::Lit::Str(lit_str),
                            ..
                        }) = &nv.value
                    {
                        storage_type = Some(match lit_str.value().as_str() {
                            "direct" => StorageType::Direct,
                            "auto_set" => StorageType::AutoSet,
                            "auto_map" => StorageType::AutoMap,
                            "auto_multimap" => StorageType::AutoMultimap,
                            "counter_map" => StorageType::CounterMap,
                            "flag" => StorageType::Flag,
                            other => {
                                meta.span()
                                    .unwrap()
                                    .error(format!(
                                        "unknown storage type: {other}. Expected \"direct\", \
                                         \"auto_set\", \"auto_map\", \"auto_multimap\", \
                                         \"counter_map\", or \"flag\""
                                    ))
                                    .emit();
                                continue;
                            }
                        });
                    } else if *ident == "category"
                        && let syn::Expr::Lit(syn::ExprLit {
                            lit: syn::Lit::Str(lit_str),
                            ..
                        }) = &nv.value
                    {
                        category = Some(match lit_str.value().as_str() {
                            "data" => Category::Data,
                            "meta" => Category::Meta,
                            "transient" => Category::Transient,
                            other => {
                                meta.span()
                                    .unwrap()
                                    .error(format!(
                                        "unknown category: {other}. Expected \"data\", \"meta\", \
                                         or \"transient\""
                                    ))
                                    .emit();
                                continue;
                            }
                        });
                    }
                }
                Meta::Path(path) => {
                    if let Some(ident) = path.get_ident() {
                        if *ident == "inline" {
                            inline = true;
                        } else if *ident == "filter_transient" {
                            filter_transient = true;
                        } else if *ident == "default" {
                            use_default = true;
                        }
                    }
                }
                _ => {}
            }
        }
    }

    // Require explicit storage type
    let storage_type = match storage_type {
        Some(st) => st,
        None => {
            field_name
                .span()
                .unwrap()
                .error(format!(
                    "field `{}` requires explicit storage type. Add #[task_storage(storage = \
                     \"...\")]. Valid types: \"direct\", \"auto_set\", \"auto_map\", \
                     \"auto_multimap\", \"counter_map\", \"flag\"",
                    field_name
                ))
                .emit();
            StorageType::Direct // Default to avoid cascading errors
        }
    };

    // Require explicit category for all fields
    let category = match category {
        Some(cat) => cat,
        None => {
            field_name
                .span()
                .unwrap()
                .error(format!(
                    "field `{}` requires explicit category. Add #[task_storage(category = \
                     \"data\")], #[task_storage(category = \"meta\")], or #[task_storage(category \
                     = \"transient\")]",
                    field_name
                ))
                .emit();
            Category::Data // Default to avoid cascading errors
        }
    };

    FieldInfo {
        field_name,
        variant_name,
        field_type,
        storage_type,
        category,
        lazy: !inline, // Default is lazy; inline = true means lazy = false
        filter_transient,
        use_default,
    }
}

/// All parsed fields stored in a single vec, with filter methods for different access patterns.
#[derive(Debug)]
struct GroupedFields {
    fields: Vec<FieldInfo>,
}

impl GroupedFields {
    fn new(fields: Vec<FieldInfo>) -> Self {
        Self { fields }
    }

    // =========================================================================
    // Flag field iterators
    // =========================================================================

    /// Returns an iterator over all flag fields (persisted first, then transient).
    /// This ordering is important for bitfield generation.
    fn all_flags(&self) -> impl Iterator<Item = &FieldInfo> {
        self.persisted_flags().chain(self.transient_flags())
    }

    /// Returns an iterator over persisted (non-transient) flag fields.
    fn persisted_flags(&self) -> impl Iterator<Item = &FieldInfo> {
        self.fields
            .iter()
            .filter(|f| f.is_flag() && !f.is_transient())
    }

    /// Returns an iterator over transient flag fields.
    fn transient_flags(&self) -> impl Iterator<Item = &FieldInfo> {
        self.fields
            .iter()
            .filter(|f| f.is_flag() && f.is_transient())
    }

    /// Returns the count of persisted flag fields.
    fn persisted_flags_count(&self) -> usize {
        self.persisted_flags().count()
    }

    /// Returns true if there are any flag fields.
    fn has_flags(&self) -> bool {
        self.fields.iter().any(|f| f.is_flag())
    }

    // =========================================================================
    // Non-flag field iterators
    // =========================================================================

    /// Returns an iterator over all non-flag fields.
    fn all_fields(&self) -> impl Iterator<Item = &FieldInfo> {
        self.fields.iter().filter(|f| !f.is_flag())
    }

    /// Returns an iterator over all lazy fields (both data and meta categories).
    fn all_lazy(&self) -> impl Iterator<Item = &FieldInfo> {
        self.fields.iter().filter(|f| !f.is_flag() && f.lazy)
    }

    /// Returns true if there are any lazy fields.
    fn has_lazy(&self) -> bool {
        self.fields.iter().any(|f| !f.is_flag() && f.lazy)
    }

    /// Returns an iterator over all inline (non-lazy, non-flag) fields.
    fn all_inline(&self) -> impl Iterator<Item = &FieldInfo> {
        self.fields.iter().filter(|f| !f.is_flag() && !f.lazy)
    }

    // =========================================================================
    // Category-specific iterators
    // =========================================================================

    /// Returns an iterator over inline data fields.
    fn inline_data(&self) -> impl Iterator<Item = &FieldInfo> {
        self.fields
            .iter()
            .filter(|f| !f.is_flag() && !f.lazy && f.category == Category::Data)
    }

    /// Returns an iterator over inline meta fields.
    fn inline_meta(&self) -> impl Iterator<Item = &FieldInfo> {
        self.fields
            .iter()
            .filter(|f| !f.is_flag() && !f.lazy && f.category == Category::Meta)
    }

    /// Returns an iterator over lazy data fields.
    fn lazy_data(&self) -> impl Iterator<Item = &FieldInfo> {
        self.fields
            .iter()
            .filter(|f| !f.is_flag() && f.lazy && f.category == Category::Data)
    }

    /// Returns an iterator over lazy meta fields.
    fn lazy_meta(&self) -> impl Iterator<Item = &FieldInfo> {
        self.fields
            .iter()
            .filter(|f| !f.is_flag() && f.lazy && f.category == Category::Meta)
    }

    // =========================================================================
    // Persistent (non-transient) field iterators for serialization
    // =========================================================================

    /// Returns an iterator over persistent (non-transient) inline meta fields.
    fn persistent_inline_meta(&self) -> impl Iterator<Item = &FieldInfo> {
        self.inline_meta().filter(|f| !f.is_transient())
    }

    /// Returns an iterator over persistent (non-transient) inline data fields.
    fn persistent_inline_data(&self) -> impl Iterator<Item = &FieldInfo> {
        self.inline_data().filter(|f| !f.is_transient())
    }

    /// Returns an iterator over persistent (non-transient) lazy meta fields.
    fn persistent_lazy_meta(&self) -> impl Iterator<Item = &FieldInfo> {
        self.lazy_meta().filter(|f| !f.is_transient())
    }

    /// Returns an iterator over persistent (non-transient) lazy data fields.
    fn persistent_lazy_data(&self) -> impl Iterator<Item = &FieldInfo> {
        self.lazy_data().filter(|f| !f.is_transient())
    }
}

// =============================================================================
// Code Generation Helpers
// =============================================================================

/// Generate inline field clone assignments: `snapshot.field = self.field.clone();`
fn gen_clone_inline_fields<'a>(
    fields: impl Iterator<Item = &'a FieldInfo>,
) -> Vec<proc_macro2::TokenStream> {
    fields
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                snapshot.#field_name = self.#field_name.clone();
            }
        })
        .collect()
}

/// Generate inline field restore assignments: `self.field = source.field;`
fn gen_restore_inline_fields<'a>(
    fields: impl Iterator<Item = &'a FieldInfo>,
) -> Vec<proc_macro2::TokenStream> {
    fields
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                self.#field_name = source.#field_name;
            }
        })
        .collect()
}

/// Generate lazy field match arms with a custom body.
/// `LazyField::Variant(data) => { <body> }`
///
/// The `body_fn` receives the field and returns the body TokenStream.
/// The body can use `data` to reference the matched value.
fn gen_lazy_match_arms<'a>(
    fields: impl Iterator<Item = &'a FieldInfo>,
    body_fn: impl Fn(&FieldInfo) -> proc_macro2::TokenStream,
) -> Vec<proc_macro2::TokenStream> {
    fields
        .map(|field| {
            let variant_name = &field.variant_name;
            let body = body_fn(field);
            quote! {
                LazyField::#variant_name(data) => {
                    #body
                }
            }
        })
        .collect()
}

/// Generate lazy field match arms with a custom body that also receives the index.
/// `LazyField::Variant(data) => { <body> }`
///
/// The `body_fn` receives the index and field, returning the body TokenStream.
/// The body can use `data` to reference the matched value.
fn gen_lazy_match_arms_indexed<'a>(
    fields: impl Iterator<Item = &'a FieldInfo>,
    body_fn: impl Fn(usize, &FieldInfo) -> proc_macro2::TokenStream,
) -> Vec<proc_macro2::TokenStream> {
    fields
        .enumerate()
        .map(|(idx, field)| {
            let variant_name = &field.variant_name;
            let body = body_fn(idx, field);
            quote! {
                LazyField::#variant_name(data) => {
                    #body
                }
            }
        })
        .collect()
}

fn generate_task_storage_impl(_ident: &Ident, grouped_fields: &GroupedFields) -> TokenStream {
    // Generate TaskFlags bitfield if there are flag fields
    let task_flags_bitfield = generate_task_flags_bitfield(grouped_fields);

    // Generate LazyField enum for lazy fields
    let lazy_field_enum = generate_lazy_field_enum(grouped_fields);

    // Generate the unified TaskStorage struct
    let typed_storage_struct = generate_typed_storage_struct(grouped_fields);

    // Generate accessor methods
    let accessor_methods = generate_accessor_methods(grouped_fields);

    // Generate TaskStorageAccessors trait for all fields
    let accessors_trait = generate_task_storage_accessors_trait(grouped_fields);

    // Generate encode/decode methods for serialization
    let encode_decode_methods = generate_encode_decode_methods(grouped_fields);

    // Generate snapshot clone and restore methods
    let snapshot_restore_methods = generate_snapshot_restore_methods(grouped_fields);

    // Generate shrink_to_fit method
    let shrink_to_fit_method = generate_shrink_to_fit_method(grouped_fields);

    let expanded = quote! {
        // Generated TaskFlags bitfield
        #task_flags_bitfield

        // Generated LazyField enum
        #lazy_field_enum

        // Generated TaskStorage struct (unified)
        #typed_storage_struct

        // Generated accessor methods
        #accessor_methods

        // Generated encode/decode methods
        #encode_decode_methods

        // Generated snapshot clone and restore methods
        #snapshot_restore_methods

        // Generated shrink_to_fit method
        #shrink_to_fit_method

        // Generated TaskStorageAccessors trait
        #accessors_trait
    };

    TokenStream::from(expanded)
}

/// Generate the TaskFlags bitfield using the bitfield crate.
///
/// Persisted flags come first (bits 0-N), then transient flags (bits N+1-M).
/// This allows serializing only the persisted portion.
fn generate_task_flags_bitfield(grouped_fields: &GroupedFields) -> proc_macro2::TokenStream {
    let all_flags: Vec<_> = grouped_fields.all_flags().collect();

    // If no flags, don't generate the bitfield
    if all_flags.is_empty() {
        return quote! {};
    }

    let persisted_count = grouped_fields.persisted_flags_count();

    // Generate bitfield accessors
    // Format: pub field_name, set_field_name: bit_index;
    let bitfield_accessors: Vec<_> = all_flags
        .iter()
        .enumerate()
        .map(|(i, field)| {
            let field_name = &field.field_name;
            let set_name = field.set_ident();
            // bitfield crate uses usize for bit indices, but literal integers work fine
            let bit_idx = i;
            quote! {
                pub #field_name, #set_name: #bit_idx
            }
        })
        .collect();

    // Generate the persisted bits mask
    let persisted_mask = (1u16 << persisted_count) - 1;

    quote! {
        bitfield::bitfield! {
            /// Combined bitfield for task flags.
            /// Persisted flags are in the lower bits (0 to N-1).
            /// Transient flags are in the higher bits (N and above).
            #[derive(Clone, Default, PartialEq, Eq)]
            pub struct TaskFlags(u16);
            impl Debug;

            #(#bitfield_accessors;)*
        }

        impl TaskFlags {
            /// Mask for persisted flags (lower bits only)
            pub const PERSISTED_MASK: u16 = #persisted_mask;

            /// Get the raw bits value
            pub fn bits(&self) -> u16 {
                self.0
            }

            /// Get only the persisted bits (for serialization)
            pub fn persisted_bits(&self) -> u16 {
                self.0 & Self::PERSISTED_MASK
            }

            /// Set bits from a raw value, preserving transient flags
            pub fn set_persisted_bits(&mut self, bits: u16) {
                self.0 = (self.0 & !Self::PERSISTED_MASK) | (bits & Self::PERSISTED_MASK);
            }

            /// Create from raw bits (for deserialization)
            pub fn from_bits(bits: u16) -> Self {
                Self(bits)
            }
        }
    }
}

/// Generate the LazyField enum containing all lazy fields
fn generate_lazy_field_enum(grouped_fields: &GroupedFields) -> proc_macro2::TokenStream {
    let all_lazy_fields: Vec<_> = grouped_fields.all_lazy().collect();

    // If no lazy_vec fields, don't generate the enum
    if all_lazy_fields.is_empty() {
        return quote! {};
    }

    // Generate enum variants
    let variants: Vec<_> = all_lazy_fields
        .iter()
        .map(|field| {
            let variant_name = &field.variant_name;
            let field_type = &field.field_type;
            quote! {
                #variant_name(#field_type)
            }
        })
        .collect();

    // Generate is_empty method arms
    let is_empty_arms: Vec<_> = all_lazy_fields
        .iter()
        .map(|field| {
            let variant_name = &field.variant_name;
            // For collection types, check if empty; for direct types, presence means non-empty
            match field.storage_type {
                StorageType::Direct => {
                    // For direct types, presence of the variant means it's non-empty
                    // (the Vec<LazyField> provides optionality, not Option<T>)
                    quote! {
                        LazyField::#variant_name(_) => false
                    }
                }
                _ => {
                    // For collection types, delegate to is_empty()
                    quote! {
                        LazyField::#variant_name(v) => v.is_empty()
                    }
                }
            }
        })
        .collect();

    // Generate is_persistent (transient check) method arms
    let is_persistent_arms: Vec<_> = all_lazy_fields
        .iter()
        .map(|field| {
            let variant_name = &field.variant_name;
            let is_persistent = !field.is_transient();
            quote! {
                LazyField::#variant_name(_) => #is_persistent
            }
        })
        .collect();

    // Generate is_meta/is_data method arms
    let is_meta_arms: Vec<_> = all_lazy_fields
        .iter()
        .map(|field| {
            let variant_name = &field.variant_name;
            let is_meta = field.category == Category::Meta;
            quote! {
                LazyField::#variant_name(_) => #is_meta
            }
        })
        .collect();

    quote! {
        /// All lazily-allocated fields stored in a single Vec.
        /// Fields are stored directly (unboxed) to avoid allocation overhead.
        #[derive(Debug, Clone, PartialEq)]
        pub enum LazyField {
            #(#variants),*
        }

        impl LazyField {
            /// Returns true if this field is empty (can be removed from the Vec)
            pub fn is_empty(&self) -> bool {
                match self {
                    #(#is_empty_arms),*
                }
            }

            /// Returns true if this field should be persisted (not transient)
            pub fn is_persistent(&self) -> bool {
                match self {
                    #(#is_persistent_arms),*
                }
            }

            /// Returns true if this field belongs to the meta category
            pub fn is_meta(&self) -> bool {
                match self {
                    #(#is_meta_arms),*
                }
            }

            /// Returns true if this field belongs to the data category
            pub fn is_data(&self) -> bool {
                !self.is_meta()
            }
        }
    }
}

/// Generate the unified TaskStorage struct with all fields directly on it.
fn generate_typed_storage_struct(grouped_fields: &GroupedFields) -> proc_macro2::TokenStream {
    let has_lazy = grouped_fields.has_lazy();
    let has_flags = grouped_fields.has_flags();

    // Collect all field definitions from both categories
    let mut field_defs = Vec::new();

    // Add inline fields directly on TaskStorage (private - use accessor methods)
    // Note: No bincode attributes since we don't derive Encode/Decode (manual serialization)
    for field in grouped_fields.all_inline() {
        let field_name = &field.field_name;
        let field_type = &field.field_type;
        field_defs.push(quote! {
            #field_name: #field_type
        });
    }

    // Add flags bitfield if needed (pub(crate) - used by TaskFlags methods)
    let flags_field = if has_flags {
        quote! {
            /// Combined bitfield for boolean flags (persisted + transient)
            pub(crate) flags: TaskFlags,
        }
    } else {
        quote! {}
    };

    // Add lazy vec field if needed (pub(crate) - used by helper methods)
    // Note: Serialization is handled manually via encode_data/encode_meta methods
    let lazy_field = if has_lazy {
        quote! {
            /// Lazily-allocated fields stored in a single Vec for memory efficiency
            pub(crate) lazy: Vec<LazyField>,
        }
    } else {
        quote! {}
    };

    // Note: Helper methods like find_lazy, find_lazy_mut, get_or_create_lazy, and
    // remove_if_empty are defined in storage_schema.rs rather than generated here.
    // This provides better IDE support (autocomplete, go-to-definition, etc.).

    // Note: We don't derive bincode::Encode/Decode here since serialization
    // will be handled manually via encode_data/encode_meta/decode_data/decode_meta methods
    quote! {
        /// Unified typed storage containing all task fields.
        /// This is designed to be embedded in the actual InnerStorage for incremental migration.

        #[derive(Debug, Clone, Default, PartialEq)]
        pub struct TaskStorage {
            #(#field_defs,)*
            #flags_field
            #lazy_field
        }

        impl TaskStorage {
            pub fn new() -> Self {
                Self::default()
            }
        }
    }
}

fn generate_accessor_methods(grouped_fields: &GroupedFields) -> proc_macro2::TokenStream {
    let mut methods = proc_macro2::TokenStream::new();

    // Generate accessor methods for all fields on TaskStorage
    // This encapsulates the storage strategy - callers use methods, not field access
    for field in grouped_fields.all_fields() {
        methods.extend(generate_field_accessors(field));
    }

    quote! {
        impl TaskStorage {
            #methods
        }
    }
}

/// Generate accessor methods on TaskStorage for a field.
///
/// Works for both inline and lazy fields. Uses FieldInfo helpers to generate
/// the appropriate access patterns.
///
/// For Direct fields, generates: `get_{field}()`, `set_{field}()`, `take_{field}()`
/// For Collection fields, generates: `{field}()`, `{field}_mut()`
fn generate_field_accessors(field: &FieldInfo) -> proc_macro2::TokenStream {
    let field_name = &field.field_name;
    let field_type = &field.field_type;

    match field.storage_type {
        StorageType::Direct => generate_direct_field_accessors(field),
        StorageType::AutoSet
        | StorageType::AutoMap
        | StorageType::AutoMultimap
        | StorageType::CounterMap => {
            generate_collection_field_accessors(field, field_name, field_type)
        }
        StorageType::Flag => {
            // Flag fields have accessors generated on TaskFlags, not TaskStorage
            unreachable!("Flag fields should not reach generate_field_accessors")
        }
    }
}

/// Generate Direct field accessors on TaskStorage (get/set/take, and get_mut for lazy).
fn generate_direct_field_accessors(field: &FieldInfo) -> proc_macro2::TokenStream {
    let field_name = &field.field_name;
    let field_type = &field.field_type;

    let get_name = field.get_ident();
    let set_name = field.set_ident();
    let take_name = field.take_ident();
    let get_mut_name = field.get_mut_ident();

    if field.is_inline() && field.use_default {
        // Inline with default: field is T stored directly, uses Default::default() for "empty"
        quote! {
            fn #get_name(&self) -> Option<&#field_type> {
                if self.#field_name != #field_type::default() {
                    Some(&self.#field_name)
                } else {
                    None
                }
            }

            fn #set_name(&mut self, value: #field_type) -> Option<#field_type> {
                let old = std::mem::replace(&mut self.#field_name, value);
                if old != #field_type::default() {
                    Some(old)
                } else {
                    None
                }
            }

            fn #take_name(&mut self) -> Option<#field_type> {
                let old = std::mem::take(&mut self.#field_name);
                if old != #field_type::default() {
                    Some(old)
                } else {
                    None
                }
            }
        }
    } else if field.is_inline() {
        // Inline: field is Option<T> stored directly on TaskStorage
        let inner_type = extract_option_inner_type(field_type);

        quote! {
            fn #get_name(&self) -> Option<&#inner_type> {
                self.#field_name.as_ref()
            }

            fn #set_name(&mut self, value: #inner_type) -> Option<#inner_type> {
                self.#field_name.replace(value)
            }

            fn #take_name(&mut self) -> Option<#inner_type> {
                self.#field_name.take()
            }
        }
    } else {
        // Lazy: field is stored in Vec<LazyField>
        let extractor = field.lazy_extractor_closure();
        let matches_pattern = field.lazy_matches_pattern();
        let constructor = field.lazy_constructor(quote! { value });
        let variant_name = &field.variant_name;

        quote! {
            fn #get_name(&self) -> Option<&#field_type> {
                self.find_lazy(#extractor)
            }

            /// Set the field value, returning the old value if present.
            fn #set_name(&mut self, value: #field_type) -> Option<#field_type> {
                // Find and remove existing if any
                let old = self.lazy.iter().position(|f| matches!(f, #matches_pattern))
                    .map(|idx| {
                        match self.lazy.swap_remove(idx) {
                            LazyField::#variant_name(v) => v,
                            _ => unreachable!(),
                        }
                    });
                self.lazy.push(#constructor);
                old
            }

            fn #take_name(&mut self) -> Option<#field_type> {
                let idx = self.lazy.iter().position(|f| matches!(f, #matches_pattern))?;
                match self.lazy.swap_remove(idx) {
                    LazyField::#variant_name(v) => Some(v),
                    _ => unreachable!(),
                }
            }

            /// Get a mutable reference to the field value (if present).
            ///
            /// Unlike `get_or_create_lazy` for collections, this does NOT allocate
            /// if the field is absent - it returns None instead.
            fn #get_mut_name(&mut self) -> Option<&mut #field_type> {
                self.find_lazy_mut(#extractor)
            }
        }
    }
}

/// Generate collection field accessors on TaskStorage (ref/mut).
fn generate_collection_field_accessors(
    field: &FieldInfo,
    field_name: &syn::Ident,
    field_type: &syn::Type,
) -> proc_macro2::TokenStream {
    let ref_name = field.ref_ident();
    let mut_name = field.mut_ident();

    if field.is_inline() {
        // Inline: direct field access
        quote! {
            fn #ref_name(&self) -> &#field_type {
                &self.#field_name
            }

            fn #mut_name(&mut self) -> &mut #field_type {
                &mut self.#field_name
            }
        }
    } else {
        // Lazy: use find_lazy / get_or_create_lazy
        let extractor = field.lazy_extractor_closure();
        let matches_closure = field.lazy_matches_closure();
        let unwrap_closure = field.lazy_unwrap_closure();
        let constructor = field.lazy_constructor(quote! { Default::default() });

        quote! {
            fn #ref_name(&self) -> Option<&#field_type> {
                self.find_lazy(#extractor)
            }

            fn #mut_name(&mut self) -> &mut #field_type {
                self.get_or_create_lazy(
                    #matches_closure,
                    #unwrap_closure,
                    || #constructor,
                )
            }
        }
    }
}

/// Generates the TaskStorageAccessors trait with accessor methods for all fields.
///
/// This trait defines:
/// 1. Required methods: `typed()` and `typed_mut(category)` that implementors must provide
/// 2. Provided methods: accessor methods for all fields
///
/// The trait is designed to be used with TaskGuard, which implements the required methods
/// and gets all the accessor methods for free.
fn generate_task_storage_accessors_trait(
    grouped_fields: &GroupedFields,
) -> proc_macro2::TokenStream {
    let mut trait_methods = proc_macro2::TokenStream::new();

    // Generate accessor methods for all non-flag fields (inline and lazy)
    for field in grouped_fields.all_fields() {
        trait_methods.extend(generate_trait_accessor_methods(field));
    }

    // Generate accessor methods for flag fields
    for field in grouped_fields.all_flags() {
        trait_methods.extend(generate_flag_trait_accessor_methods(field));
    }

    quote! {
        /// Trait for typed storage accessors.
        ///
        /// This trait is auto-generated by the TaskStorage macro.
        /// Implementors only need to provide `typed()`, `typed_mut()`, `track_modification()`,
        /// and `check_access()` methods, and all accessor methods are provided automatically.
        ///
        /// This is designed to work with TaskGuard.
        pub trait TaskStorageAccessors {
            /// Access the typed storage (read-only)
            fn typed(&self) -> &TaskStorage;

            /// Access the typed storage (mutable).
            ///
            /// Note: This does NOT track modifications. Call `track_modification()` separately
            /// when the data actually changes. This split allows generated accessors to
            /// only track modifications when actual changes occur.
            fn typed_mut(&mut self) -> &mut TaskStorage;

            /// Track that a modification occurred for the given category.
            ///
            /// Should be called after confirming that data actually changed.
            /// This is separate from `typed_mut()` to allow optimizations where
            /// we only track modifications when something actually changes.
            fn track_modification(&mut self, category: crate::backend::storage::SpecificTaskDataCategory);

            /// Verify that the task was accessed with the correct category before reading/writing.
            ///
            /// This is a debug assertion that catches bugs where code tries to access data
            /// without having restored it from storage first.
            ///
            /// The category parameter uses `TaskDataCategory`:
            /// - `Data` or `Meta`: Checks that the task was accessed with that category
            /// - `All`: Used for transient data - no check is performed
            ///
            /// Implementors should check that the provided category matches how the task was accessed.
            fn check_access(&self, category: crate::backend::TaskDataCategory);

            /// Shrink all collection fields to fit their current contents.
            ///
            /// This releases excess memory from hash maps and hash sets that may have
            /// grown larger than needed during task execution.
            ///
            /// Note: This does NOT track modifications since shrink_to_fit doesn't
            /// semantically change the data - it only reduces memory usage.
            fn shrink_to_fit(&mut self) {
                self.typed_mut().shrink_to_fit();
            }

            #trait_methods
        }
    }
}

/// Generates trait accessor methods for a field (works for both inline and lazy storage).
///
/// Uses `FieldInfo` helpers to generate the correct access patterns:
/// - For inline: direct field access via `self.typed().field` / `self.typed_mut().field`
/// - For lazy: delegates to TaskStorage accessors
fn generate_trait_accessor_methods(field: &FieldInfo) -> proc_macro2::TokenStream {
    let field_type = &field.field_type;
    let check_access = field.check_access_call();
    let ref_expr = field.collection_ref_expr();
    let mut_expr = field.collection_mut_expr();
    let is_option = field.is_option_ref();

    match field.storage_type {
        StorageType::Direct => {
            // Direct storage delegates to TaskStorage accessor methods
            generate_direct_accessors(field)
        }
        StorageType::AutoSet => {
            // For AutoSet types, generate read-only accessor plus add/remove/has/iter/len/is_empty
            let ref_name = field.ref_ident();

            let (return_type, doc_comment) = if is_option {
                (
                    quote! { Option<&#field_type> },
                    "/// Get a reference to the collection (may be None if not allocated, \
                     read-only)",
                )
            } else {
                (
                    quote! { &#field_type },
                    "/// Get a reference to the collection (read-only)",
                )
            };

            let base_accessor = quote! {
                #[doc = #doc_comment]
                fn #ref_name(&self) -> #return_type {
                    #check_access
                    #ref_expr
                }
            };

            let set_ops = generate_autoset_ops(field);

            quote! {
                #base_accessor
                #set_ops
            }
        }
        StorageType::CounterMap => {
            // For CounterMap types, generate read-only accessor plus mutation methods
            let ref_name = field.ref_ident();

            let (return_type, doc_comment) = if is_option {
                (
                    quote! { Option<&#field_type> },
                    "/// Get a reference to the collection (may be None if not allocated, \
                     read-only)",
                )
            } else {
                (
                    quote! { &#field_type },
                    "/// Get a reference to the collection (read-only)",
                )
            };

            let base_accessor = quote! {
                #[doc = #doc_comment]
                fn #ref_name(&self) -> #return_type {
                    #check_access
                    #ref_expr
                }
            };

            let countermap_ops = generate_countermap_ops(field);

            quote! {
                #base_accessor
                #countermap_ops
            }
        }
        StorageType::AutoMap => {
            // For AutoMap types, generate immutable and mutable accessors plus operation methods
            let ref_name = field.ref_ident();
            let mut_name = field.mut_ident();

            let (return_type, ref_doc) = if is_option {
                (
                    quote! { Option<&#field_type> },
                    "/// Get a reference to the collection (may be None if not allocated)",
                )
            } else {
                (
                    quote! { &#field_type },
                    "/// Get a reference to the collection",
                )
            };

            let base_accessor = quote! {
                #[doc = #ref_doc]
                fn #ref_name(&self) -> #return_type {
                    #check_access
                    #ref_expr
                }

                /// Get a mutable reference to the collection (allocates if needed for lazy fields).
                ///
                /// Note: This does NOT track modifications. Call `track_modification` after
                /// making changes to ensure persistence.
                fn #mut_name(&mut self) -> &mut #field_type {
                    #check_access
                    #mut_expr
                }
            };

            let automap_ops = generate_automap_ops(field);

            quote! {
                #base_accessor
                #automap_ops
            }
        }
        StorageType::AutoMultimap => {
            // For AutoMultimap types, generate immutable and mutable accessors plus multimap
            // operations
            let ref_name = field.ref_ident();
            let mut_name = field.mut_ident();

            let (return_type, ref_doc) = if is_option {
                (
                    quote! { Option<&#field_type> },
                    "/// Get a reference to the multimap (may be None if not allocated)",
                )
            } else {
                (
                    quote! { &#field_type },
                    "/// Get a reference to the multimap",
                )
            };

            let base_accessor = quote! {
                #[doc = #ref_doc]
                fn #ref_name(&self) -> #return_type {
                    #check_access
                    #ref_expr
                }

                /// Get a mutable reference to the multimap (allocates if needed for lazy fields).
                ///
                /// Note: This does NOT track modifications. Call `track_modification` after
                /// making changes to ensure persistence.
                fn #mut_name(&mut self) -> &mut #field_type {
                    #check_access
                    #mut_expr
                }
            };

            let automultimap_ops = generate_automultimap_ops(field);

            quote! {
                #base_accessor
                #automultimap_ops
            }
        }
        StorageType::Flag => {
            // Flag fields have accessors generated on TaskFlags, not TaskStorageAccessors
            unreachable!("Flag fields should not reach generate_trait_accessor_methods")
        }
    }
}

/// Generate Direct field accessors for TaskStorageAccessors trait.
///
/// Uses `FieldInfo` helpers to delegate to TaskStorage accessor methods,
/// which handle the inline/lazy difference internally.
///
/// Generates methods:
/// - `get_{field}_ref() -> Option<&T>` - Get reference to value
/// - `has_{field}() -> bool` - Check if value exists
/// - `set_{field}(value) -> Option<T>` - Set value, returning old value
/// - `take_{field}() -> Option<T>` - Take value, clearing the field
/// - `get_{field}_mut() -> Option<&mut T>` - Get mutable reference (lazy fields only)
fn generate_direct_accessors(field: &FieldInfo) -> proc_macro2::TokenStream {
    let field_type = &field.field_type;
    let check_access = field.check_access_call();
    let track_modification = field.track_modification_call();

    // Use FieldInfo helpers for TaskStorage delegation
    let get_expr = field.direct_get_expr();
    let set_expr = field.direct_set_expr();
    let take_expr = field.direct_take_expr();

    // Method names
    let get_name = field.get_ident();
    let has_name = field.has_ident();
    let set_name = field.set_ident();
    let take_name = field.take_ident();

    // For inline fields, the type is Option<T> and we extract T.
    // For lazy fields, the type is T directly (Vec presence provides optionality).
    let value_type = if field.is_inline() {
        extract_option_inner_type(field_type)
    } else {
        quote! { #field_type }
    };

    // Generate get_mut accessor only for lazy fields
    // (for inline fields, use set/take instead)
    let get_mut_accessor = if !field.is_inline() {
        let get_mut_name = field.get_mut_ident();
        let get_mut_expr = field.direct_get_mut_expr();
        quote! {
            /// Get a mutable reference to the field value (if present).
            ///
            /// Note: This does NOT track modifications. Call `track_modification` after
            /// making changes to ensure persistence.
            fn #get_mut_name(&mut self) -> Option<&mut #value_type> {
                #check_access
                #get_mut_expr
            }
        }
    } else {
        quote! {}
    };

    quote! {
        /// Get a reference to the field value (if present)
        fn #get_name(&self) -> Option<&#value_type> {
            #check_access
            #get_expr
        }

        /// Check if this field has a value
        fn #has_name(&self) -> bool {
            #check_access
            #get_expr.is_some()
        }

        /// Set the field value, returning the old value if present
        fn #set_name(&mut self, value: #value_type) -> Option<#value_type> {
            #check_access
            #track_modification
            #set_expr(value)
        }

        /// Take the field value, clearing it
        ///
        /// Only tracks modification if there was a value to take.
        fn #take_name(&mut self) -> Option<#value_type> {
            #check_access
            let value = #take_expr;
            if value.is_some() {
                #track_modification
            }
            value
        }

        #get_mut_accessor
    }
}

/// Generate add/remove/has/iter/len/is_empty operations for an AutoSet field.
///
/// Uses `FieldInfo` helpers to generate the correct access patterns:
/// - For inline: direct field access via `self.typed().field` / `self.typed_mut().field`
/// - For lazy: delegates to TaskStorage accessors
///
/// Generates methods with `_item` suffix to distinguish single-item operations
/// from potential bulk operations: `add_X_item`, `remove_X_item`, `has_X_item`
fn generate_autoset_ops(field: &FieldInfo) -> proc_macro2::TokenStream {
    let field_type = &field.field_type;

    let Some(element_type) = extract_set_element_type(field_type) else {
        return quote! {};
    };

    let check_access = field.check_access_call();
    let track_modification = field.track_modification_call();
    let mut_expr = field.collection_mut_expr();
    let ref_expr = field.collection_ref_expr();
    let is_option = field.is_option_ref();

    let add_name = field.prefixed_ident("add");
    let add_items_name = field.suffixed_ident("extend");
    let remove_name = field.prefixed_ident("remove");
    let has_name = field.prefixed_ident("has");
    let iter_name = field.iter_ident();
    let len_name = field.len_ident();
    let is_empty_name = field.is_empty_ident();

    // Generate bodies based on whether ref access returns Option or not
    let has_body = if is_option {
        quote! { #ref_expr.is_some_and(|set| set.contains(item)) }
    } else {
        quote! { #ref_expr.contains(item) }
    };

    let iter_body = if is_option {
        quote! { #ref_expr.into_iter().flat_map(|set| set.iter().copied()) }
    } else {
        quote! { #ref_expr.iter().copied() }
    };

    let len_body = if is_option {
        quote! { #ref_expr.map_or(0, |set| set.len()) }
    } else {
        quote! { #ref_expr.len() }
    };

    let is_empty_body = if is_option {
        quote! { #ref_expr.is_none_or(|set| set.is_empty()) }
    } else {
        quote! { #ref_expr.is_empty() }
    };

    // Remove uses find_lazy_mut for lazy to avoid allocation.
    // Using nested if-let to avoid clippy::question_mark warnings in generated code.
    let remove_body = if is_option {
        let variant_name = &field.variant_name;
        quote! {
            if let Some(set) = self.typed_mut().find_lazy_mut(|f| match f {
                LazyField::#variant_name(v) => Some(v),
                _ => None,
            }) {
                let removed = set.remove(item);
                if removed {
                    #track_modification
                }
                return removed;
            }
            false
        }
    } else {
        quote! {
            let removed = #mut_expr.remove(item);
            if removed {
                #track_modification
            }
            removed
        }
    };

    quote! {
        /// Check if the set contains an item
        fn #has_name(&self, item: &#element_type) -> bool {
            #check_access
            #has_body
        }

        /// Add an item to the set.
        /// Returns true if the item was newly added, false if it already existed.
        #[must_use]
        fn #add_name(&mut self, item: #element_type) -> bool {
            #check_access
            let added = #mut_expr.insert(item);
            if added {
                #track_modification
            }
            added
        }

        /// Add multiple items to the set from an iterator.
        /// Only tracks modification if at least one item is actually added.
        fn #add_items_name(&mut self, items: impl Iterator<Item = #element_type>) {
            #check_access
            let set = #mut_expr;
            let mut any_added = false;
            for item in items {
                if set.insert(item) {
                    any_added = true;
                }
            }
            if any_added {
                #track_modification
            }
        }

        /// Remove an item from the set.
        /// Returns true if the item was present and removed, false if it wasn't present.
        fn #remove_name(&mut self, item: &#element_type) -> bool {
            #check_access
            #remove_body
        }

        /// Iterate over all items in the set
        fn #iter_name(&self) -> impl Iterator<Item = #element_type> + '_ {
            #check_access
            #iter_body
        }

        /// Get the number of items in the set
        fn #len_name(&self) -> usize {
            #check_access
            #len_body
        }

        /// Check if the set is empty
        fn #is_empty_name(&self) -> bool {
            #check_access
            #is_empty_body
        }
    }
}

/// Generate CounterMap operations for a field (works for both inline and lazy storage).
///
/// Uses `FieldInfo` helpers to generate the correct access patterns:
/// - For inline: direct field access via `self.typed().field` / `self.typed_mut().field`
/// - For lazy: delegates to TaskStorage accessors via `self.typed().field()` /
///   `self.typed_mut().field_mut()`
///
/// Generates methods for:
/// - `update_{field}_count(key, delta) -> bool` - Returns true if crossed zero boundary
/// - `update_and_get_{field}(key, delta) -> V` - Returns new value
/// - `update_{field}(key, f)` - Closure-based update
/// - `add_{field}(key, value)` - Insert new, panics if exists
/// - `remove_{field}(key) -> Option<V>` - Standard HashMap remove
/// - `update_{field}_positive_crossing(key, delta) -> bool` - For i32 types
/// - `get_{field}_entry(key) -> Option<&V>` - Single-item lookup
fn generate_countermap_ops(field: &FieldInfo) -> proc_macro2::TokenStream {
    let field_type = &field.field_type;

    let Some((key_type, value_type)) = extract_countermap_types(field_type) else {
        return quote! {};
    };

    let check_access = field.check_access_call();
    let track_modification = field.track_modification_call();
    let mut_expr = field.collection_mut_expr();
    let ref_expr = field.collection_ref_expr();
    let is_option = field.is_option_ref();

    // Method names - use shorter names to match existing API
    let update_count_name = field.infixed_ident("update", "count");
    let update_and_get_name = field.prefixed_ident("update_and_get");
    let update_with_name = field.prefixed_ident("update");
    let add_entry_name = field.prefixed_ident("add");
    let remove_name = field.prefixed_ident("remove");
    let update_positive_crossing_name = field.infixed_ident("update", "positive_crossing");
    let get_entry_name = field.infixed_ident("get", "entry");
    let iter_entries_name = field.infixed_ident("iter", "entries");
    let iter_positive_entries_name = field.infixed_ident("iter", "positive_entries");
    let len_name = field.len_ident();
    let is_empty_name = field.is_empty_ident();

    // Generate get_entry body based on whether ref access returns Option or not
    let get_entry_body = if is_option {
        quote! { #ref_expr.and_then(|m| m.get(key)) }
    } else {
        quote! { #ref_expr.get(key) }
    };

    // Generate remove body - for lazy fields, we need to check if the map exists first
    // without allocating it. For inline fields, we can use the mut_expr directly.
    let remove_body = if is_option {
        // Lazy: use find_lazy_mut to avoid allocating, only track modification if something was
        // removed. Using ? operator to early-return None if map doesn't exist.
        let variant_name = &field.variant_name;
        quote! {
            let map = self.typed_mut().find_lazy_mut(|f| match f {
                LazyField::#variant_name(v) => Some(v),
                _ => None,
            })?;
            let result = map.remove(key);
            if result.is_some() {
                #track_modification
            }
            result
        }
    } else {
        // Inline: direct access, only track modification if something was removed
        quote! {
            let result = #mut_expr.remove(key);
            if result.is_some() {
                #track_modification
            }
            result
        }
    };

    // Generate len body
    let len_body = if is_option {
        quote! { #ref_expr.map_or(0, |m| m.len()) }
    } else {
        quote! { #ref_expr.len() }
    };

    // Generate is_empty body
    let is_empty_body = if is_option {
        quote! { #ref_expr.is_none_or(|m| m.is_empty()) }
    } else {
        quote! { #ref_expr.is_empty() }
    };

    // Generate iter_entries body
    let iter_entries_body = if is_option {
        quote! { #ref_expr.into_iter().flat_map(|m| m.iter()) }
    } else {
        quote! { #ref_expr.iter() }
    };

    // Generate iter_positive_entries body (entries where value > 0)
    let iter_positive_entries_body = if is_option {
        quote! {
            #ref_expr.into_iter().flat_map(|m| {
                m.iter().filter_map(|(k, v)| if *v > Default::default() { Some((k, v)) } else { None })
            })
        }
    } else {
        quote! {
            #ref_expr.iter().filter_map(|(k, v)| if *v > Default::default() { Some((k, v)) } else { None })
        }
    };

    quote! {
        /// Get a single entry from the counter map
        fn #get_entry_name(&self, key: &#key_type) -> Option<&#value_type> {
            #check_access
            #get_entry_body
        }

        /// Update a counter by the given delta.
        /// Returns true if the count crossed zero (became zero or became non-zero).
        #[must_use]
        fn #update_count_name(&mut self, key: #key_type, delta: #value_type) -> bool {
            #check_access
            #track_modification
            use crate::backend::storage_schema::CounterMapExt;
            #mut_expr.update_count(key, delta)
        }

        /// Update a counter by the given delta and return the new value.
        fn #update_and_get_name(&mut self, key: #key_type, delta: #value_type) -> #value_type {
            #check_access
            #track_modification
            use crate::backend::storage_schema::CounterMapExt;
            #mut_expr.update_and_get(key, delta)
        }

        /// Update a counter using a closure that receives the current value
        /// (or None if not present) and returns the new value (or None to remove).
        fn #update_with_name<F>(&mut self, key: #key_type, f: F)
        where
            F: FnOnce(Option<#value_type>) -> Option<#value_type>,
        {
            #check_access
            #track_modification
            use crate::backend::storage_schema::CounterMapExt;
            #mut_expr.update_with(key, f)
        }

        /// Add a new entry, panicking if the entry already exists.
        fn #add_entry_name(&mut self, key: #key_type, value: #value_type) {
            #check_access
            #track_modification
            use crate::backend::storage_schema::CounterMapExt;
            #mut_expr.add_entry(key, value)
        }

        /// Remove an entry, returning the value if present.
        /// Only tracks modification if an entry was actually removed.
        fn #remove_name(&mut self, key: &#key_type) -> Option<#value_type> {
            #check_access
            #remove_body
        }

        /// Update a signed counter by the given delta.
        /// Returns true if the count crossed the positive boundary (became positive or non-positive).
        #[must_use]
        fn #update_positive_crossing_name(&mut self, key: #key_type, delta: #value_type) -> bool {
            #check_access
            #track_modification
            use crate::backend::storage_schema::CounterMapExt;
            #mut_expr.update_positive_crossing(key, delta)
        }

        /// Get the number of entries in the counter map
        fn #len_name(&self) -> usize {
            #check_access
            #len_body
        }

        /// Check if the counter map is empty
        fn #is_empty_name(&self) -> bool {
            #check_access
            #is_empty_body
        }

        /// Iterate over all key-value pairs in the counter map
        fn #iter_entries_name(&self) -> impl Iterator<Item = (&#key_type, &#value_type)> + '_ {
            #check_access
            #iter_entries_body
        }

        /// Iterate over key-value pairs where value > 0
        fn #iter_positive_entries_name(&self) -> impl Iterator<Item = (&#key_type, &#value_type)> + '_ {
            #check_access
            #iter_positive_entries_body
        }
    }
}

/// Generate AutoMap operations for a field (works for both inline and lazy storage).
///
/// Uses `FieldInfo` helpers to generate the correct access patterns:
/// - For inline: direct field access via `self.typed().field` / `self.typed_mut().field`
/// - For lazy: delegates to TaskStorage accessors
///
/// Generates methods (using `_entry` suffix for consistency with CounterMap):
/// - `get_{field}_entry(key) -> Option<&V>` - Single-item lookup
/// - `has_{field}_entry(key) -> bool` - Check if key exists
/// - `insert_{field}_entry(key, value) -> Option<V>` - Insert or replace
/// - `remove_{field}_entry(key) -> Option<V>` - Remove entry
/// - `iter_{field}_entries() -> impl Iterator<Item = (&K, &V)>` - Iterate all
/// - `{field}_len() -> usize` - Get count
/// - `is_{field}_empty() -> bool` - Check if empty
fn generate_automap_ops(field: &FieldInfo) -> proc_macro2::TokenStream {
    let field_type = &field.field_type;

    let Some((key_type, value_type)) = extract_automap_types(field_type) else {
        return quote! {};
    };

    let check_access = field.check_access_call();
    let track_modification = field.track_modification_call();
    let mut_expr = field.collection_mut_expr();
    let ref_expr = field.collection_ref_expr();
    let is_option = field.is_option_ref();

    // Method names (using `_entry` suffix for consistency with CounterMap)
    let get_entry_name = field.infixed_ident("get", "entry");
    let has_entry_name = field.infixed_ident("has", "entry");
    let insert_entry_name = field.infixed_ident("insert", "entry");
    let remove_entry_name = field.infixed_ident("remove", "entry");
    let iter_entries_name = field.infixed_ident("iter", "entries");
    let len_name = field.len_ident();
    let is_empty_name = field.is_empty_ident();

    // Generate bodies based on whether ref access returns Option or not
    let get_entry_body = if is_option {
        quote! { #ref_expr.and_then(|m| m.get(key)) }
    } else {
        quote! { #ref_expr.get(key) }
    };

    let has_entry_body = if is_option {
        quote! { #ref_expr.is_some_and(|m| m.contains_key(key)) }
    } else {
        quote! { #ref_expr.contains_key(key) }
    };

    let iter_body = if is_option {
        quote! { #ref_expr.into_iter().flat_map(|m| m.iter()) }
    } else {
        quote! { #ref_expr.iter() }
    };

    let len_body = if is_option {
        quote! { #ref_expr.map_or(0, |m| m.len()) }
    } else {
        quote! { #ref_expr.len() }
    };

    let is_empty_body = if is_option {
        quote! { #ref_expr.is_none_or(|m| m.is_empty()) }
    } else {
        quote! { #ref_expr.is_empty() }
    };

    // Generate remove body - for lazy fields, avoid allocation if map doesn't exist.
    // Using ? operator to early-return None if map doesn't exist.
    let remove_body = if is_option {
        let variant_name = &field.variant_name;
        quote! {
            let map = self.typed_mut().find_lazy_mut(|f| match f {
                LazyField::#variant_name(v) => Some(v),
                _ => None,
            })?;
            let result = map.remove(key);
            if result.is_some() {
                #track_modification
            }
            result
        }
    } else {
        quote! {
            let result = #mut_expr.remove(key);
            if result.is_some() {
                #track_modification
            }
            result
        }
    };

    quote! {
        /// Get an entry from the map by key
        fn #get_entry_name(&self, key: &#key_type) -> Option<&#value_type> {
            #check_access
            #get_entry_body
        }

        /// Check if the map contains a key
        fn #has_entry_name(&self, key: &#key_type) -> bool {
            #check_access
            #has_entry_body
        }

        /// Insert an entry, returning the old value if present.
        fn #insert_entry_name(&mut self, key: #key_type, value: #value_type) -> Option<#value_type> {
            #check_access
            #track_modification
            #mut_expr.insert(key, value)
        }

        /// Remove an entry, returning the value if present.
        /// Only tracks modification if an entry was actually removed.
        fn #remove_entry_name(&mut self, key: &#key_type) -> Option<#value_type> {
            #check_access
            #remove_body
        }

        /// Iterate over all key-value pairs in the map
        fn #iter_entries_name(&self) -> impl Iterator<Item = (&#key_type, &#value_type)> + '_ {
            #check_access
            #iter_body
        }

        /// Get the number of entries in the map
        fn #len_name(&self) -> usize {
            #check_access
            #len_body
        }

        /// Check if the map is empty
        fn #is_empty_name(&self) -> bool {
            #check_access
            #is_empty_body
        }
    }
}

/// Extract the inner type from Option<T>, or return the type as-is if not Option
fn extract_option_inner_type(ty: &Type) -> proc_macro2::TokenStream {
    // Try to parse as Option<T> and extract T
    if let Type::Path(type_path) = ty
        && let Some(segment) = type_path.path.segments.last()
        && segment.ident == "Option"
        && let syn::PathArguments::AngleBracketed(args) = &segment.arguments
        && let Some(syn::GenericArgument::Type(inner)) = args.args.first()
    {
        return quote! { #inner };
    }

    // Not Option<T>, return the type as-is
    quote! { #ty }
}

/// Extract the element type K from AutoSet<K> (which is FxHashSet<K>)
fn extract_set_element_type(ty: &Type) -> Option<proc_macro2::TokenStream> {
    if let Type::Path(type_path) = ty
        && let Some(segment) = type_path.path.segments.last()
        && (segment.ident == "AutoSet" || segment.ident == "FxHashSet")
        && let syn::PathArguments::AngleBracketed(args) = &segment.arguments
        && let Some(syn::GenericArgument::Type(inner)) = args.args.first()
    {
        return Some(quote! { #inner });
    }
    None
}

/// Extract key and value types from CounterMap<K, V> (which is FxHashMap<K, V>)
fn extract_countermap_types(
    ty: &Type,
) -> Option<(proc_macro2::TokenStream, proc_macro2::TokenStream)> {
    if let Type::Path(type_path) = ty
        && let Some(segment) = type_path.path.segments.last()
        && (segment.ident == "CounterMap" || segment.ident == "FxHashMap")
        && let syn::PathArguments::AngleBracketed(args) = &segment.arguments
    {
        let mut args_iter = args.args.iter();
        if let Some(syn::GenericArgument::Type(key_type)) = args_iter.next()
            && let Some(syn::GenericArgument::Type(value_type)) = args_iter.next()
        {
            return Some((quote! { #key_type }, quote! { #value_type }));
        }
    }
    None
}

/// Extract key and value types from AutoMap<K, V> (which is FxHashMap<K, V>)
fn extract_automap_types(
    ty: &Type,
) -> Option<(proc_macro2::TokenStream, proc_macro2::TokenStream)> {
    if let Type::Path(type_path) = ty
        && let Some(segment) = type_path.path.segments.last()
        && (segment.ident == "AutoMap" || segment.ident == "FxHashMap")
        && let syn::PathArguments::AngleBracketed(args) = &segment.arguments
    {
        let mut args_iter = args.args.iter();
        if let Some(syn::GenericArgument::Type(key_type)) = args_iter.next()
            && let Some(syn::GenericArgument::Type(value_type)) = args_iter.next()
        {
            return Some((quote! { #key_type }, quote! { #value_type }));
        }
    }
    None
}

/// Extract key and value types from AutoMultimap<K, V> (which is FxHashMap<K, FxHashSet<V>>)
fn extract_automultimap_types(
    ty: &Type,
) -> Option<(proc_macro2::TokenStream, proc_macro2::TokenStream)> {
    if let Type::Path(type_path) = ty
        && let Some(segment) = type_path.path.segments.last()
        && segment.ident == "AutoMultimap"
        && let syn::PathArguments::AngleBracketed(args) = &segment.arguments
    {
        let mut args_iter = args.args.iter();
        if let Some(syn::GenericArgument::Type(key_type)) = args_iter.next()
            && let Some(syn::GenericArgument::Type(value_type)) = args_iter.next()
        {
            return Some((quote! { #key_type }, quote! { #value_type }));
        }
    }
    None
}

/// Generate operations for AutoMultimap (one-to-many key-value relationships).
///
/// Generates these methods for `field: AutoMultimap<K, V>`:
/// - `add_{field}_value(key, value) -> bool` - add value to set for key, returns true if newly
///   added
/// - `remove_{field}_value(key, value) -> bool` - remove value from set for key, cleans up empty
///   sets
/// - `has_{field}_value(key, value) -> bool` - check if value exists in set for key
/// - `iter_{field}()` - iterate all (key, value) pairs (flattening the sets)
/// - `iter_{field}_values_for_key(key)` - iterate values for a specific key
/// - `{field}_len() -> usize` - total number of key-value pairs
/// - `is_{field}_empty() -> bool` - check if multimap is empty
fn generate_automultimap_ops(field: &FieldInfo) -> proc_macro2::TokenStream {
    let field_type = &field.field_type;

    let Some((key_type, value_type)) = extract_automultimap_types(field_type) else {
        return quote! {};
    };

    let check_access = field.check_access_call();
    let track_modification = field.track_modification_call();
    let mut_expr = field.collection_mut_expr();
    let ref_expr = field.collection_ref_expr();
    let is_option = field.is_option_ref();

    // Method names
    let add_value_name = field.infixed_ident("add", "value");
    let remove_value_name = field.infixed_ident("remove", "value");
    let has_value_name = field.infixed_ident("has", "value");
    // Use a different name to avoid conflicts with manual implementations that may copy values
    let iter_name = field.infixed_ident("iter", "all");
    let iter_values_for_key_name = field.infixed_ident("iter", "values_for_key");
    let len_name = field.len_ident();
    let is_empty_name = field.is_empty_ident();

    // Generate bodies based on whether ref access returns Option or not
    let has_value_body = if is_option {
        quote! { #ref_expr.is_some_and(|m| m.get(key).is_some_and(|s| s.contains(value))) }
    } else {
        quote! { #ref_expr.get(key).is_some_and(|s| s.contains(value)) }
    };

    let iter_body = if is_option {
        quote! {
            #ref_expr.into_iter().flat_map(|m| {
                m.iter().flat_map(|(k, set)| set.iter().map(move |v| (k, v)))
            })
        }
    } else {
        quote! {
            #ref_expr.iter().flat_map(|(k, set)| set.iter().map(move |v| (k, v)))
        }
    };

    let iter_values_for_key_body = if is_option {
        quote! {
            #ref_expr.and_then(|m| m.get(key)).into_iter().flat_map(|s| s.iter())
        }
    } else {
        quote! {
            #ref_expr.get(key).into_iter().flat_map(|s| s.iter())
        }
    };

    let len_body = if is_option {
        quote! { #ref_expr.map_or(0, |m| m.values().map(|s| s.len()).sum()) }
    } else {
        quote! { #ref_expr.values().map(|s| s.len()).sum() }
    };

    let is_empty_body = if is_option {
        quote! { #ref_expr.is_none_or(|m| m.values().all(|s| s.is_empty())) }
    } else {
        quote! { #ref_expr.values().all(|s| s.is_empty()) }
    };

    // For add: insert and only track modification if actually added
    let add_body = quote! {
        let inserted = #mut_expr.entry(key).or_default().insert(value);
        if inserted {
            #track_modification
        }
        inserted
    };

    // For remove: attempt removal directly, only track modification if actually removed.
    // Using nested if-let to avoid clippy::question_mark warnings in generated code.
    let remove_body = if is_option {
        let variant_name = &field.variant_name;
        quote! {
            if let Some(map) = self.typed_mut().find_lazy_mut(|f| match f {
                LazyField::#variant_name(v) => Some(v),
                _ => None,
            }) {
                if let Some(set) = map.get_mut(key) {
                    if set.remove(value) {
                        if set.is_empty() {
                            map.remove(key);
                        }
                        #track_modification
                        return true;
                    }
                }
            }
            false
        }
    } else {
        quote! {
            let map = #mut_expr;
            if let Some(set) = map.get_mut(key) {
                if set.remove(value) {
                    if set.is_empty() {
                        map.remove(key);
                    }
                    #track_modification
                    return true;
                }
            }
            false
        }
    };

    quote! {
        /// Add a value to the set for the given key.
        /// Returns true if the value was newly added, false if it already existed.
        fn #add_value_name(&mut self, key: #key_type, value: #value_type) -> bool {
            #check_access
            #add_body
        }

        /// Remove a value from the set for the given key.
        /// Returns true if the value was removed, false if it didn't exist.
        /// Automatically cleans up empty sets.
        fn #remove_value_name(&mut self, key: &#key_type, value: &#value_type) -> bool {
            #check_access
            #remove_body
        }

        /// Check if a value exists in the set for the given key.
        fn #has_value_name(&self, key: &#key_type, value: &#value_type) -> bool {
            #check_access
            #has_value_body
        }

        /// Iterate over all (key, value) pairs in the multimap.
        fn #iter_name(&self) -> impl Iterator<Item = (&#key_type, &#value_type)> + '_ {
            #check_access
            #iter_body
        }

        /// Iterate over all values for a specific key.
        fn #iter_values_for_key_name<'a>(&'a self, key: &'a #key_type) -> impl Iterator<Item = &#value_type> + 'a {
            #check_access
            #iter_values_for_key_body
        }

        /// Get the total number of key-value pairs in the multimap.
        fn #len_name(&self) -> usize {
            #check_access
            #len_body
        }

        /// Check if the multimap is empty.
        fn #is_empty_name(&self) -> bool {
            #check_access
            #is_empty_body
        }
    }
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

/// Convert snake_case to PascalCase (e.g., "in_progress" -> "InProgress")
fn to_pascal_case(s: &str) -> String {
    s.split('_').map(capitalize).collect::<String>()
}

/// Generates trait accessor methods for a flag field (stored in TaskFlags bitfield)
fn generate_flag_trait_accessor_methods(field: &FieldInfo) -> proc_macro2::TokenStream {
    let field_name = &field.field_name;
    let set_name = field.set_ident();

    // Flags use check_access_call() which handles transient vs non-transient
    let check_access = field.check_access_call();
    // All flags modify meta category (they're stored in the flags bitfield which is meta)
    let track_modification = quote! { self.track_modification(crate::backend::storage::SpecificTaskDataCategory::Meta); };

    quote! {
        /// Get the flag value
        fn #field_name(&self) -> bool {
            #check_access
            self.typed().flags.#field_name()
        }

        /// Set the flag value
        ///
        /// Only tracks modification if the value actually changes.
        fn #set_name(&mut self, value: bool) {
            #check_access
            let current = self.typed().flags.#field_name();
            if current != value {
                self.typed_mut().flags.#set_name(value);
                #track_modification
            }
        }
    }
}

/// Generate encode/decode methods for TaskStorage serialization.
///
/// Generates four methods:
/// - `encode_meta<E>(&self, encoder: &mut E)` - Encode meta category fields
/// - `encode_data<E>(&self, encoder: &mut E)` - Encode data category fields
/// - `decode_meta<D>(&mut self, decoder: &mut D)` - Decode meta category fields
/// - `decode_data<D>(&mut self, decoder: &mut D)` - Decode data category fields
///
/// Only persistent (non-transient) fields are encoded/decoded.
fn generate_encode_decode_methods(grouped_fields: &GroupedFields) -> proc_macro2::TokenStream {
    // Collect persistent fields by category using helpers
    let persistent_inline_meta: Vec<_> = grouped_fields.persistent_inline_meta().collect();
    let persistent_inline_data: Vec<_> = grouped_fields.persistent_inline_data().collect();
    let persistent_lazy_meta: Vec<_> = grouped_fields.persistent_lazy_meta().collect();
    let persistent_lazy_data: Vec<_> = grouped_fields.persistent_lazy_data().collect();

    let has_flags = grouped_fields.persisted_flags().next().is_some();

    // Generate encode_meta body
    let encode_meta_inline: Vec<_> = persistent_inline_meta
        .iter()
        .map(|field| generate_encode_inline_field(field))
        .collect();

    let encode_meta_flags = if has_flags {
        quote! {
            // Encode only the persisted flag bits
            let persisted_flags = self.flags.persisted_bits();
            bincode::Encode::encode(&persisted_flags, encoder)?;
        }
    } else {
        quote! {}
    };

    let encode_meta_lazy = generate_encode_lazy_fields(&persistent_lazy_meta);

    // Generate encode_data body
    let encode_data_inline: Vec<_> = persistent_inline_data
        .iter()
        .map(|field| generate_encode_inline_field(field))
        .collect();

    let encode_data_lazy = generate_encode_lazy_fields(&persistent_lazy_data);

    // Generate decode_meta body
    let decode_meta_inline: Vec<_> = persistent_inline_meta
        .iter()
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                self.#field_name = bincode::Decode::decode(decoder)?;
            }
        })
        .collect();

    let decode_meta_flags = if has_flags {
        quote! {
            // Decode only the persisted flag bits, preserving transient bits
            let persisted_flags: u16 = bincode::Decode::decode(decoder)?;
            self.flags.set_persisted_bits(persisted_flags);
        }
    } else {
        quote! {}
    };

    let decode_meta_lazy = generate_decode_lazy_fields(&persistent_lazy_meta);

    // Generate decode_data body
    let decode_data_inline: Vec<_> = persistent_inline_data
        .iter()
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                self.#field_name = bincode::Decode::decode(decoder)?;
            }
        })
        .collect();

    let decode_data_lazy = generate_decode_lazy_fields(&persistent_lazy_data);

    quote! {
        impl TaskStorage {
            /// Encode meta category fields directly to bincode.
            /// Only persistent (non-transient) fields are encoded.
            pub fn encode_meta<E: bincode::enc::Encoder>(
                &self,
                encoder: &mut E,
            ) -> Result<(), bincode::error::EncodeError> {
                // Encode inline meta fields
                #(#encode_meta_inline)*

                // Encode flags (persisted bits only)
                #encode_meta_flags

                // Encode lazy meta fields
                #encode_meta_lazy

                Ok(())
            }

            /// Encode data category fields directly to bincode.
            /// Only persistent (non-transient) fields are encoded.
            pub fn encode_data<E: bincode::enc::Encoder>(
                &self,
                encoder: &mut E,
            ) -> Result<(), bincode::error::EncodeError> {
                // Encode inline data fields
                #(#encode_data_inline)*

                // Encode lazy data fields
                #encode_data_lazy

                Ok(())
            }

            /// Decode meta category fields from bincode.
            /// Only persistent (non-transient) fields are decoded.
            pub fn decode_meta<D: bincode::de::Decoder>(
                &mut self,
                decoder: &mut D,
            ) -> Result<(), bincode::error::DecodeError> {
                // Decode inline meta fields
                #(#decode_meta_inline)*

                // Decode flags (persisted bits only)
                #decode_meta_flags

                // Decode lazy meta fields
                #decode_meta_lazy

                Ok(())
            }

            /// Decode data category fields from bincode.
            /// Only persistent (non-transient) fields are decoded.
            pub fn decode_data<D: bincode::de::Decoder>(
                &mut self,
                decoder: &mut D,
            ) -> Result<(), bincode::error::DecodeError> {
                // Decode inline data fields
                #(#decode_data_inline)*

                // Decode lazy data fields
                #decode_data_lazy

                Ok(())
            }
        }
    }
}

/// Sentinel byte marking the end of lazy fields in serialization.
/// Must be a value that cannot be a valid discriminant (discriminants start at 0).
const LAZY_FIELD_SENTINEL: u8 = 0x00;

// =============================================================================
// Transient Filtering Helpers
// =============================================================================

/// Filter predicate type for transient filtering.
///
/// Describes what type of value the filter applies to:
/// - `Option`: filter predicate for Option inner value
/// - `Set`: filter predicate for set elements
/// - `Map`: filter predicate for map entries (key, value)
/// - `CounterMap`: filter predicate for counter map entries (key only)
/// - `MapWithSetValues`: filter predicate for map values that are sets
#[derive(Clone, Copy)]
enum FilterPredicateType {
    Option,
    Set,
    Map,
    CounterMap,
    MapWithSetValues,
}

/// Generate the filter predicate closure for a field.
///
/// Returns the predicate expression (e.g., `|k| !k.is_transient()`) and the predicate type.
/// Returns `None` if no filtering is needed.
fn generate_filter_predicate(
    field: &FieldInfo,
) -> Option<(proc_macro2::TokenStream, FilterPredicateType)> {
    // AutoMultimap always filters transient values from inner sets (implicit behavior)
    if field.storage_type == StorageType::AutoMultimap {
        return Some((
            // Filter entries where inner set has any non-transient values
            quote! { |(_, v)| v.iter().any(|item| !item.is_transient()) },
            FilterPredicateType::MapWithSetValues,
        ));
    }

    if !field.filter_transient {
        return None;
    }

    match field.storage_type {
        StorageType::Direct => Some((
            quote! { |v| !v.is_transient() },
            FilterPredicateType::Option,
        )),
        StorageType::AutoSet => Some((quote! { |k| !k.is_transient() }, FilterPredicateType::Set)),
        StorageType::CounterMap => Some((
            quote! { |(k, _)| !k.is_transient() },
            FilterPredicateType::CounterMap,
        )),
        StorageType::AutoMap => Some((
            quote! { |(k, v)| !k.is_transient() && !v.is_transient() },
            FilterPredicateType::Map,
        )),
        StorageType::AutoMultimap => unreachable!("AutoMultimap handled above"),
        StorageType::Flag => {
            // Flags are encoded in TaskFlags bitfield, not individually
            unreachable!("Flag fields should not reach generate_filter_predicate")
        }
    }
}

/// Generate code to encode a value with transient filtering based on field configuration.
///
/// This is a shared helper used by both inline field encoding and lazy field encoding.
/// The `value_ref` parameter is an expression that evaluates to a *reference* to the value
/// (e.g., `&self.field_name` for inline fields, or `data` for lazy fields where `data`
/// is already a reference from the match arm).
fn generate_encode_value(
    field: &FieldInfo,
    value_ref: proc_macro2::TokenStream,
) -> proc_macro2::TokenStream {
    let Some((predicate, pred_type)) = generate_filter_predicate(field) else {
        // No filtering needed, just encode normally
        return quote! {
            bincode::Encode::encode(#value_ref, encoder)?;
        };
    };

    match pred_type {
        FilterPredicateType::Option => {
            // For Option<T>, check if the value is transient and encode None if so
            quote! {
                {
                    let filtered_value = (#value_ref).as_ref().filter(#predicate);
                    bincode::Encode::encode(&filtered_value, encoder)?;
                }
            }
        }
        FilterPredicateType::Set => {
            // For AutoSet<K>, filter out transient keys
            quote! {
                {
                    let count = (#value_ref).iter().filter(#predicate).count();
                    bincode::Encode::encode(&count, encoder)?;
                    for key in (#value_ref).iter().filter(#predicate) {
                        bincode::Encode::encode(key, encoder)?;
                    }
                }
            }
        }
        FilterPredicateType::CounterMap => {
            // For counter maps, filter out entries with transient keys
            quote! {
                {
                    let count = (#value_ref).iter().filter(#predicate).count();
                    bincode::Encode::encode(&count, encoder)?;
                    for (key, value) in (#value_ref).iter().filter(#predicate) {
                        bincode::Encode::encode(key, encoder)?;
                        bincode::Encode::encode(value, encoder)?;
                    }
                }
            }
        }
        FilterPredicateType::Map => {
            // For maps, filter out entries with transient keys or values
            quote! {
                {
                    let count = (#value_ref).iter().filter(#predicate).count();
                    bincode::Encode::encode(&count, encoder)?;
                    for (key, value) in (#value_ref).iter().filter(#predicate) {
                        bincode::Encode::encode(key, encoder)?;
                        bincode::Encode::encode(value, encoder)?;
                    }
                }
            }
        }
        FilterPredicateType::MapWithSetValues => {
            // For maps with set values, filter transient entries from the inner sets
            quote! {
                {
                    // Count entries where filtered set is non-empty
                    let count = (#value_ref).iter().filter(#predicate).count();
                    bincode::Encode::encode(&count, encoder)?;
                    for (key, value) in (#value_ref).iter().filter(#predicate) {
                        let filtered: Vec<_> = value.iter()
                            .filter(|item| !item.is_transient())
                            .collect();
                        bincode::Encode::encode(key, encoder)?;
                        bincode::Encode::encode(&filtered.len(), encoder)?;
                        for item in filtered {
                            bincode::Encode::encode(item, encoder)?;
                        }
                    }
                }
            }
        }
    }
}

/// Check if encoding with transient filtering might produce an empty result.
///
/// For non-filtered fields, encoding always produces output.
/// For filtered fields, the result might be empty (skip discriminant).
fn field_needs_empty_check(field: &FieldInfo) -> bool {
    generate_filter_predicate(field).is_some()
}

/// Generate an expression that checks if a value is non-empty after transient filtering.
///
/// Returns code that evaluates to `true` if there's data to encode.
fn generate_non_empty_check(
    field: &FieldInfo,
    value_expr: proc_macro2::TokenStream,
) -> proc_macro2::TokenStream {
    let Some((predicate, pred_type)) = generate_filter_predicate(field) else {
        return quote! { true };
    };

    match pred_type {
        FilterPredicateType::Option => {
            quote! {
                (#value_expr).as_ref().map_or(false, #predicate)
            }
        }
        FilterPredicateType::Set
        | FilterPredicateType::CounterMap
        | FilterPredicateType::Map
        | FilterPredicateType::MapWithSetValues => {
            quote! {
                (#value_expr).iter().any(#predicate)
            }
        }
    }
}

/// Generate code to encode an inline field to bincode.
///
/// Delegates to `generate_encode_value` with `&self.field_name` as the value reference.
fn generate_encode_inline_field(field: &FieldInfo) -> proc_macro2::TokenStream {
    let field_name = &field.field_name;
    generate_encode_value(field, quote! { &self.#field_name })
}

/// Generate code to encode lazy fields to bincode.
/// Uses sentinel-terminated format: [discriminant, data]... [sentinel]
fn generate_encode_lazy_fields(fields: &[&FieldInfo]) -> proc_macro2::TokenStream {
    if fields.is_empty() {
        return quote! {};
    }

    // Generate match arms for encoding each field variant
    let encode_arms = gen_lazy_match_arms_indexed(fields.iter().copied(), |idx, field| {
        let discriminant = idx as u8 + 1;
        let encode_body = generate_encode_value(field, quote! { data });

        if field_needs_empty_check(field) {
            // For fields with transient filtering, check if non-empty before writing discriminant
            let non_empty_check = generate_non_empty_check(field, quote! { data });
            quote! {
                if #non_empty_check {
                    bincode::Encode::encode(&#discriminant, encoder)?;
                    #encode_body
                }
            }
        } else {
            // No filtering, always encode
            quote! {
                bincode::Encode::encode(&#discriminant, encoder)?;
                #encode_body
            }
        }
    });

    quote! {
        // Encode each persistent lazy field in this category
        for field in &self.lazy {
            match field {
                #(#encode_arms)*
                _ => {} // Skip fields not in this category
            }
        }
        // Write sentinel to mark end of lazy fields
        bincode::Encode::encode(&#LAZY_FIELD_SENTINEL, encoder)?;
    }
}

/// Generate code to decode lazy fields from bincode.
/// Reads until sentinel byte (0x00) is encountered.
fn generate_decode_lazy_fields(fields: &[&FieldInfo]) -> proc_macro2::TokenStream {
    if fields.is_empty() {
        return quote! {};
    }

    // Generate match arms for decoding each field variant
    let decode_arms: Vec<_> = fields
        .iter()
        .enumerate()
        .map(|(idx, field)| {
            let variant_name = &field.variant_name;
            let discriminant = idx as u8 + 1;
            quote! {
                #discriminant => LazyField::#variant_name(bincode::Decode::decode(decoder)?)
            }
        })
        .collect();

    quote! {
        // Decode lazy fields until LAZY_FIELD_SENTINEL
        loop {
            let discriminant: u8 = bincode::Decode::decode(decoder)?;
            let field = match discriminant {
                #(#decode_arms,)*
                #LAZY_FIELD_SENTINEL => {
                    break
                }
                _ => {
                    return Err(bincode::error::DecodeError::Other(
                        "Unknown lazy field discriminant",
                    ));
                }
            };
            self.lazy.push(field);
        }
    }
}

/// Generate snapshot clone and restore methods for TaskStorage.
///
/// Generates:
/// - `clone_meta_snapshot(&self) -> TaskStorage` - Clone only persistent meta fields
/// - `clone_data_snapshot(&self) -> TaskStorage` - Clone only persistent data fields
/// - `restore_from(&mut self, source, category)` - Restore data by category from decoded storage
/// - `restore_meta_from(&mut self, source)` - Restore meta fields from source
/// - `restore_data_from(&mut self, source)` - Restore data fields from source
/// - `restore_all_from(&mut self, source)` - Restore all fields from source
fn generate_snapshot_restore_methods(grouped_fields: &GroupedFields) -> proc_macro2::TokenStream {
    let has_flags = grouped_fields.persisted_flags().next().is_some();

    // Use helper functions to generate field operations
    let clone_meta_inline = gen_clone_inline_fields(grouped_fields.persistent_inline_meta());
    let clone_data_inline = gen_clone_inline_fields(grouped_fields.persistent_inline_data());
    let clone_meta_lazy_arms =
        gen_lazy_match_arms(grouped_fields.persistent_lazy_meta(), |field| {
            let variant_name = &field.variant_name;
            quote! { snapshot.lazy.push(LazyField::#variant_name(data.clone())); }
        });
    let clone_data_lazy_arms =
        gen_lazy_match_arms(grouped_fields.persistent_lazy_data(), |field| {
            let variant_name = &field.variant_name;
            quote! { snapshot.lazy.push(LazyField::#variant_name(data.clone())); }
        });

    let restore_meta_inline = gen_restore_inline_fields(grouped_fields.persistent_inline_meta());
    let restore_data_inline = gen_restore_inline_fields(grouped_fields.persistent_inline_data());

    // Generate flags handling for clone/merge
    let clone_meta_flags = if has_flags {
        quote! {
            // Clone persisted flags
            snapshot.flags.set_persisted_bits(self.flags.persisted_bits());
        }
    } else {
        quote! {}
    };

    let restore_flags = if has_flags {
        quote! {
            // Restore persisted flags (preserve transient flags)
            let persisted_bits = source.flags.persisted_bits();
            self.flags.set_persisted_bits(persisted_bits);
        }
    } else {
        quote! {}
    };

    quote! {
        impl TaskStorage {
            /// Create a snapshot containing all persistent fields (both meta and data).
            ///
            /// This clones all persistent fields into a new TaskStorage, skipping
            /// transient fields that may not be cloneable. Use this for the `Both`
            /// snapshot case where both meta and data are dirty.
            pub fn clone_snapshot(&self) -> TaskStorage {
                let mut snapshot = TaskStorage::new();

                // Clone inline meta fields
                #(#clone_meta_inline)*

                // Clone inline data fields
                #(#clone_data_inline)*

                #clone_meta_flags

                // Clone all persistent lazy fields (both meta and data)
                for field in &self.lazy {
                    match field {
                        #(#clone_data_lazy_arms)*
                        #(#clone_meta_lazy_arms)*
                        // Skip transient fields
                        _ => {}
                    }
                }

                snapshot
            }

            /// Create a snapshot containing only meta category fields for serialization.
            ///
            /// This clones only the persistent meta fields into a new TaskStorage,
            /// which can then be serialized outside the lock.
            pub fn clone_meta_snapshot(&self) -> TaskStorage {
                let mut snapshot = TaskStorage::new();

                // Clone inline meta fields
                #(#clone_meta_inline)*

                #clone_meta_flags

                // Clone lazy meta fields (only persistent ones)
                for field in &self.lazy {
                    match field {
                        #(#clone_meta_lazy_arms)*
                        // Skip transient and data fields
                        _ => {}
                    }
                }

                snapshot
            }

            /// Create a snapshot containing only data category fields for serialization.
            ///
            /// This clones only the persistent data fields into a new TaskStorage,
            /// which can then be serialized outside the lock.
            pub fn clone_data_snapshot(&self) -> TaskStorage {
                let mut snapshot = TaskStorage::new();

                // Clone inline data fields
                #(#clone_data_inline)*

                // Clone lazy data fields (only persistent ones)
                for field in &self.lazy {
                    match field {
                        #(#clone_data_lazy_arms)*
                        // Skip transient and meta fields
                        _ => {}
                    }
                }

                snapshot
            }

            /// Restore persisted data from a decoded TaskStorage.
            ///
            /// This is used during restore operations to copy decoded persisted data
            /// into the task's existing storage. It preserves transient state (flags,
            /// transient fields) while restoring the persisted data.
            ///
            /// # Invariant
            ///
            /// This method assumes the target does NOT already have the persistent fields
            /// being restored. This is guaranteed by the restore protocol which only calls
            /// this once per category when the task is first accessed. Debug assertions
            /// verify this invariant.
            ///
            /// The `category` parameter specifies which category of data to restore:
            /// - `Meta`: Restore meta fields (aggregation_number, output, upper, dirty, etc.)
            /// - `Data`: Restore data fields (output_dependent, dependencies, cell_data, etc.)
            /// - `All`: Restore both meta and data fields
            pub fn restore_from(
                &mut self,
                source: TaskStorage,
                category: crate::backend::TaskDataCategory,
            ) {
                match category {
                    crate::backend::TaskDataCategory::Meta => self.restore_meta_from(source),
                    crate::backend::TaskDataCategory::Data => self.restore_data_from(source),
                    crate::backend::TaskDataCategory::All => self.restore_all_from(source),
                }
            }

            /// Restore meta category fields from source.
            ///
            /// Debug assertions verify that the target doesn't already have the lazy fields
            /// being restored.
            fn restore_meta_from(&mut self, source: TaskStorage) {
                // Debug assertion: verify target doesn't already have persistent meta lazy fields
                debug_assert!(
                    !self.lazy.iter().any(|f| f.is_persistent() && f.is_meta()),
                    "restore_meta_from called on storage that already has persistent meta lazy fields"
                );

                // Inline meta fields - direct assignment
                #(#restore_meta_inline)*

                #restore_flags

                // Extend lazy vec with persistent meta fields from source
                self.lazy.extend(
                    source.lazy.into_iter().filter(|f| f.is_persistent() && f.is_meta())
                );
            }

            /// Restore data category fields from source.
            ///
            /// Debug assertions verify that the target doesn't already have the lazy fields
            /// being restored.
            fn restore_data_from(&mut self, source: TaskStorage) {
                // Debug assertion: verify target doesn't already have persistent data lazy fields
                debug_assert!(
                    !self.lazy.iter().any(|f| f.is_persistent() && f.is_data()),
                    "restore_data_from called on storage that already has persistent data lazy fields"
                );

                // Inline data fields - direct assignment
                #(#restore_data_inline)*

                // Extend lazy vec with persistent data fields from source
                self.lazy.extend(
                    source.lazy.into_iter().filter(|f| f.is_persistent() && f.is_data())
                );
            }

            /// Restore all fields from source (both meta and data).
            ///
            /// Debug assertions verify that the target doesn't already have the lazy fields
            /// being restored.
            fn restore_all_from(&mut self, source: TaskStorage) {
                // Debug assertion: verify target doesn't already have any persistent lazy fields
                debug_assert!(
                    !self.lazy.iter().any(|f| f.is_persistent()),
                    "restore_all_from called on storage that already has persistent lazy fields"
                );

                // Inline meta fields - direct assignment
                #(#restore_meta_inline)*

                // Inline data fields - direct assignment
                #(#restore_data_inline)*

                #restore_flags

                // Extend lazy vec with all persistent fields from source
                self.lazy.extend(
                    source.lazy.into_iter().filter(|f| f.is_persistent())
                );
            }
        }
    }
}

/// Generate shrink_to_fit method for TaskStorage.
///
/// This generates a method that calls shrink_to_fit() on all collection-type fields
/// (auto_set, counter_map, auto_map) to release excess memory.
fn generate_shrink_to_fit_method(grouped_fields: &GroupedFields) -> proc_macro2::TokenStream {
    // Helper to check if a storage type supports shrink_to_fit
    fn supports_shrink_to_fit(storage_type: &StorageType) -> bool {
        matches!(
            storage_type,
            StorageType::AutoSet
                | StorageType::CounterMap
                | StorageType::AutoMap
                | StorageType::AutoMultimap
        )
    }

    // Collect inline fields that support shrink_to_fit
    let inline_shrink_calls: Vec<_> = grouped_fields
        .all_inline()
        .filter(|f| supports_shrink_to_fit(&f.storage_type))
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                self.#field_name.shrink_to_fit();
            }
        })
        .collect();

    // Collect lazy fields that support shrink_to_fit using the helper
    let lazy_shrink_arms = gen_lazy_match_arms(
        grouped_fields
            .all_lazy()
            .filter(|f| supports_shrink_to_fit(&f.storage_type)),
        |_| quote! { data.shrink_to_fit(); },
    );

    // Only generate lazy field shrinking if there are lazy fields to shrink
    let lazy_shrink_block = if lazy_shrink_arms.is_empty() {
        quote! {}
    } else {
        quote! {
            // Shrink lazy collection fields
            for field in &mut self.lazy {
                match field {
                    #(#lazy_shrink_arms)*
                    // Skip fields that don't support shrink_to_fit
                    _ => {}
                }
            }
        }
    };

    quote! {
        impl TaskStorage {
            /// Shrink all collection fields to fit their current contents.
            ///
            /// This releases excess memory from hash maps and hash sets that may have
            /// grown larger than needed during task execution.
            pub fn shrink_to_fit(&mut self) {
                // Shrink inline collection fields
                #(#inline_shrink_calls)*

                #lazy_shrink_block

                // Shrink the lazy vec itself
                self.lazy.shrink_to_fit();
            }
        }
    }
}
