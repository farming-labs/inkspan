use super::parse_options;
use markdown::{mdast::Node, to_mdast};
use serde_json::json;
use wasm_bindgen::prelude::*;

// Convert only the offsets returned to JS. Nested spans are not necessarily in end-offset order.
fn utf16_offsets(source: &str, offsets: &mut Vec<usize>) -> Option<Vec<usize>> {
    offsets.sort_unstable();
    offsets.dedup();
    let (mut previous, mut units) = (0, 0);
    let mut result = Vec::with_capacity(offsets.len());
    for &offset in offsets.iter() {
        units += source.get(previous..offset)?.encode_utf16().count();
        result.push(units);
        previous = offset;
    }
    Some(result)
}

#[wasm_bindgen]
pub fn structural_index(
    source: &str,
    mdx: bool,
    components: bool,
    names: Vec<String>,
    fences: bool,
) -> Option<String> {
    if source.starts_with('\u{feff}') || source.contains(['\r', '\0']) {
        return None;
    }
    let tree = to_mdast(source, &parse_options(mdx)).ok()?;
    let mut pending = vec![&tree];
    let mut elements = Vec::new();
    let mut blocks = Vec::new();
    let mut imports = Vec::new();
    let mut offsets = Vec::new();
    while let Some(node) = pending.pop() {
        let name = match node {
            Node::MdxJsxFlowElement(n) => n.name.as_deref(),
            Node::MdxJsxTextElement(n) => n.name.as_deref(),
            _ => None,
        };
        if let Some(name) = name
            && components
            && (names.is_empty() || names.iter().any(|n| n == name))
        {
            let pos = node.position()?;
            let (start, end) = (pos.start.offset, pos.end.offset);
            // The source must begin at this named tag, even within Markdown containers.
            if !source.get(start..end)?.strip_prefix('<')?.starts_with(name) {
                return None;
            }
            elements.push((name, start, end));
            offsets.extend([start, end]);
        }
        if let Node::MdxjsEsm(esm) = node {
            imports.push(&esm.value);
        }
        if fences && let Node::Code(code) = node {
            let pos = code.position.as_ref()?;
            let (start, end) = (pos.start.offset, pos.end.offset);
            let raw = source.get(start..end)?;
            if raw.starts_with("```") || raw.starts_with("~~~") {
                blocks.push((code, start, end, pos.start.line, pos.end.line));
                offsets.extend([start, end]);
            }
        }
        if let Some(children) = node.children() {
            pending.extend(children.iter().rev());
        }
    }
    let converted = utf16_offsets(source, &mut offsets)?;
    let js = |byte| {
        converted[offsets
            .binary_search(&byte)
            .expect("collected source offset")]
    };
    let components: Vec<_> = elements
        .into_iter()
        .map(|(name, start, end)| json!({"name":name,"start":js(start),"end":js(end)}))
        .collect();
    let code_blocks: Vec<_> = blocks
        .into_iter()
        .map(|(code, start, end, start_line, end_line)| {
            json!({
                "start":js(start),"end":js(end),"startLine":start_line,"endLine":end_line,
                "language":code.lang,"meta":code.meta,"code":code.value,
            })
        })
        .collect();
    Some(json!([{"components":components,"codeBlocks":code_blocks},imports]).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn returns_utf16_spans_and_skips_quoted_examples() {
        let source = "🌱\n\n`<Box/>`\n\n<Box><Box /></Box>";
        let result = structural_index(source, true, true, vec![], false).unwrap();
        let values: serde_json::Value = serde_json::from_str(&result).unwrap();
        let elements = values[0]["components"].as_array().unwrap();
        assert_eq!(elements.len(), 2);
        assert_eq!(
            elements[0]["start"],
            source[..source.find("<Box>").unwrap()]
                .encode_utf16()
                .count()
        );
        assert_eq!(elements[0]["end"], source.encode_utf16().count());
    }
}
