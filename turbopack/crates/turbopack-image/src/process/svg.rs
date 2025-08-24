// Ported from https://github.com/image-size/image-size/blob/94e9c1ee913b71222d7583dc904ac0116ae00834/lib/types/svg.ts
// see SVG_LICENSE for license info

use anyhow::{Result, anyhow, bail};
use once_cell::sync::Lazy;
use regex::Regex;
use rustc_hash::FxHashMap;

const INCH_CM: f64 = 2.54;
static UNITS: Lazy<FxHashMap<&str, f64>> = Lazy::new(|| {
    FxHashMap::from_iter([
        ("in", 96.0),
        ("cm", 96.0 / INCH_CM),
        ("em", 16.0),
        ("ex", 8.0),
        ("m", 96.0 / INCH_CM * 100.0),
        ("mm", 96.0 / INCH_CM / 10.0),
        ("pc", 96.0 / 72.0 / 12.0),
        ("pt", 96.0 / 72.0),
        ("px", 1.0),
        ("", 1.0),
    ])
});

static UNIT_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^([0-9.]+(?:e-?\d+)?)((?:in|cm|em|ex|m|mm|pc|pt|px)?)$").unwrap());

static ROOT_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"<svg\s([^>"']|"[^"]*"|'[^']*')*>"#).unwrap());
static WIDTH_REGEX: Lazy<Regex> = Lazy::new(|| Regex::new(r#"\swidth=['"]([^%]+?)['"]"#).unwrap());
static HEIGHT_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"\sheight=['"]([^%]+?)['"]"#).unwrap());
static VIEW_BOX_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"\sviewBox=['"](.+?)['"]"#).unwrap());
static VIEW_BOX_CONTENT_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^\s*((?:\w|\.|-)+)\s+((?:\w|\.|-)+)\s+((?:\w|\.|-)+)\s+((?:\w|\.|-)+)\s*$")
        .unwrap()
});

fn parse_length(len: &str) -> Result<f64> {
    let captures = UNIT_REGEX
        .captures(len)
        .ok_or_else(|| anyhow!("Unknown syntax for length, expected value with unit ({len})"))?;
    let val = captures[1].parse::<f64>()?;
    let unit = &captures[2];
    let unit_scale = UNITS
        .get(unit)
        .ok_or_else(|| anyhow!("Unknown unit {unit}"))?;
    Ok(val * unit_scale)
}

fn parse_viewbox(viewbox: &str) -> Result<(f64, f64)> {
    let captures = VIEW_BOX_CONTENT_REGEX
        .captures(viewbox)
        .ok_or_else(|| anyhow!("Unknown syntax for viewBox ({viewbox})"))?;
    let width = parse_length(&captures[3])?;
    let height = parse_length(&captures[4])?;
    Ok((width, height))
}

fn calculate_by_viewbox(
    view_box: (f64, f64),
    width: Option<Result<f64>>,
    height: Option<Result<f64>>,
) -> Result<(u32, u32)> {
    let ratio = view_box.0 / view_box.1;
    if let Some(width) = width {
        let width = width?.round() as u32;
        let height = (width as f64 / ratio).round() as u32;
        return Ok((width, height));
    }
    if let Some(height) = height {
        let height = height?.round() as u32;
        let width = (height as f64 * ratio).round() as u32;
        return Ok((width, height));
    }
    Ok((view_box.0.round() as u32, view_box.1.round() as u32))
}

pub fn calculate(content: &str) -> Result<(u32, u32)> {
    let Some(root) = ROOT_REGEX.find(content) else {
        bail!("Source code does not contain a <svg> root element");
    };
    let root = root.as_str();
    let width = WIDTH_REGEX.captures(root).map(|c| parse_length(&c[1]));
    let height = HEIGHT_REGEX.captures(root).map(|c| parse_length(&c[1]));
    let viewbox = VIEW_BOX_REGEX.captures(root).map(|c| parse_viewbox(&c[1]));
    if let Some(width) = width {
        if let Some(height) = height {
            Ok((width?.round() as u32, height?.round() as u32))
        } else {
            bail!("SVG source code contains only a width attribute but not height attribute");
        }
    } else if let Some(viewbox) = viewbox {
        calculate_by_viewbox(viewbox?, width, height)
    } else {
        bail!("SVG source code does not contain width and height or viewBox attribute");
    }
}

#[cfg(test)]
mod tests {
    use anyhow::Result;

    use super::calculate;

    #[test]
    fn test_calculate() {
        let svg1 = r#"<svg width="100" height="50"></svg>"#;
        assert_eq!(calculate(svg1).unwrap(), (100, 50));

        let svg2 = r#"<svg width="100" height="50" viewBox="0 0 200 100"></svg>"#;
        assert_eq!(calculate(svg2).unwrap(), (100, 50));

        let svg3 = r#"<svg viewBox="0 0 200 100"></svg>"#;
        assert_eq!(calculate(svg3).unwrap(), (200, 100));

        let svg4 = r#"<svg width="100px" height="50px"></svg>"#;
        assert_eq!(calculate(svg4).unwrap(), (100, 50));

        let svg5 = r#"<svg width="100" height="50" viewBox="0 0 200 100"></svg>"#;
        assert_eq!(calculate(svg5).unwrap(), (100, 50));

        let svg6 = r#"<svg></svg>"#;
        assert!(calculate(svg6).is_err());

        let svg7 = r#"<svg width="100"></svg>"#;
        assert!(calculate(svg7).is_err());

        let svg8 = r#"<svg height="50"></svg>"#;
        assert!(calculate(svg8).is_err());

        let svg9 = r#"<svg viewBox="0 0 200"></svg>"#;
        assert!(calculate(svg9).is_err());

        let svg10 = r#"<svg width="100" height="invalid"></svg>"#;
        assert!(calculate(svg10).is_err());
    }

    #[test]
    fn test_calculate_with_units() -> Result<()> {
        let svg = r#"<svg width="2cm" height="50mm"></svg>"#;
        let result = calculate(svg)?;
        assert_eq!(result, (76, 189));
        Ok(())
    }

    #[test]
    fn test_calculate_with_em() -> Result<()> {
        let svg = r#"<svg width="20em" height="10em"></svg>"#;
        let result = calculate(svg)?;
        assert_eq!(result, (320, 160));
        Ok(())
    }

    #[test]
    fn test_calculate_with_ex() -> Result<()> {
        let svg = r#"<svg width="20ex" height="10ex"></svg>"#;
        let result = calculate(svg)?;
        assert_eq!(result, (160, 80));
        Ok(())
    }

    #[test]
    fn test_calculate_complex_viewbox() -> Result<()> {
        let svg = r#"<svg viewBox="-100 -10.5 5000e-2 50.42e3"></svg>"#;
        let result = calculate(svg)?;
        assert_eq!(result, (50, 50420));
        Ok(())
    }
}
