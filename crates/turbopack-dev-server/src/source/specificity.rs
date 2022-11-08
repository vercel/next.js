use std::{cmp::Ordering, fmt::Display};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::trace::TraceRawVcs;

/// Type of something that affects the specificity of a URL, making a URL match
/// less specific.
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone, Debug, Serialize, Deserialize, TraceRawVcs)]
pub enum SpecificityElementType {
    // types listed in order of specificity, most specific last
    NotFound,
    Fallback,
    CatchAll,
    DynamicSegment,
}

/// An element of something that makes a URL less unspecific. Includes a
/// position.
#[derive(PartialEq, Eq, Clone, Debug, Serialize, Deserialize, TraceRawVcs)]
struct SpecificityElement {
    /// Position of the element in the url, as index of segment.
    position: u32,
    ty: SpecificityElementType,
}

impl PartialOrd for SpecificityElement {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for SpecificityElement {
    fn cmp(&self, other: &Self) -> Ordering {
        // Elements that appear later in the URL are more specific.
        self.position
            .cmp(&other.position)
            .then_with(|| self.ty.cmp(&other.ty))
    }
}

/// The specificity of a URL. Implements Ord to allow to compare two
/// specificities. A match with higher specificity should be preferred.
#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub struct Specificity {
    #[turbo_tasks(trace_ignore)]
    elements: Vec<SpecificityElement>,
}

impl PartialOrd for Specificity {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Specificity {
    fn cmp(&self, other: &Self) -> Ordering {
        let mut a = self.elements.iter();
        let mut b = other.elements.iter();
        loop {
            match (a.next(), b.next()) {
                (Some(a), Some(b)) => match a.cmp(b) {
                    Ordering::Equal => continue,
                    ordering => return ordering,
                },
                // Having no [SpecificityElement] is more specific than having some.
                (Some(_), None) => return Ordering::Less,
                (None, Some(_)) => return Ordering::Greater,
                (None, None) => return Ordering::Equal,
            }
        }
    }
}

impl Specificity {
    /// Create a new specificity.
    pub fn new() -> Self {
        Self {
            elements: Vec::new(),
        }
    }

    /// Add a new element to the specificity.
    pub fn add(&mut self, position: u32, ty: SpecificityElementType) {
        self.elements.push(SpecificityElement { position, ty })
    }

    /// Clones the specificity and adds a new element to it.
    pub fn with(&self, position: u32, ty: SpecificityElementType) -> Self {
        let mut new = self.clone();
        new.add(position, ty);
        new
    }

    /// Returns true if the specificity is exact. This means it's the maximum
    /// specificity and any loop could early exit.
    pub fn is_exact(&self) -> bool {
        self.elements.is_empty()
    }
}

impl Display for Specificity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut pos = 0;
        for element in &self.elements {
            while pos < element.position {
                write!(f, "/static")?;
                pos += 1;
            }
            f.write_str(match element.ty {
                SpecificityElementType::NotFound => "/[...not found]",
                SpecificityElementType::Fallback => "/[...fallback]",
                SpecificityElementType::CatchAll => "/[...catch all]",
                SpecificityElementType::DynamicSegment => "/[dynamic]",
            })?;
            pos += 1;
        }
        if pos == 0 {
            write!(f, "/static")?;
        }
        Ok(())
    }
}

#[turbo_tasks::value_impl]
impl SpecificityVc {
    /// The lowest possible specificity. Used when no match is found.
    #[turbo_tasks::function]
    pub fn not_found() -> Self {
        Specificity {
            elements: vec![SpecificityElement {
                position: 0,
                ty: SpecificityElementType::NotFound,
            }],
        }
        .cell()
    }

    /// The highest possible specificity. Used for exact matches.
    #[turbo_tasks::function]
    pub fn exact() -> Self {
        Specificity {
            elements: Vec::new(),
        }
        .cell()
    }

    /// The specificity with an additional catch all at the specified position.
    #[turbo_tasks::function]
    pub async fn with_catch_all(self, position: u32) -> Result<Self> {
        Ok(self
            .await?
            .with(position, SpecificityElementType::CatchAll)
            .cell())
    }

    /// The specificity with an additional dynamic segment at the specified
    /// position.
    #[turbo_tasks::function]
    pub async fn with_dynamic_segment(self, position: u32) -> Result<Self> {
        Ok(self
            .await?
            .with(position, SpecificityElementType::DynamicSegment)
            .cell())
    }

    /// The specificity with an additional fallback match at the specified
    /// position.
    #[turbo_tasks::function]
    pub async fn with_fallback(self, position: u32) -> Result<Self> {
        Ok(self
            .await?
            .with(position, SpecificityElementType::Fallback)
            .cell())
    }
}
