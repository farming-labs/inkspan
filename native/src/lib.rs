mod flat;
mod index;
mod projection;
use markdown::{Constructs, MdxExpressionKind, MdxSignal, ParseOptions, mdast::Node, to_mdast};
use wasm_bindgen::prelude::*;

fn use_reference_parser() -> MdxSignal {
    MdxSignal::Error(
        "Use the MDX reference parser.".into(),
        0,
        Box::default(),
        Box::default(),
    )
}

fn validate_expression(value: &str, kind: &MdxExpressionKind) -> MdxSignal {
    let value = value.trim_matches([' ', '\t', '\r', '\n']);
    let constant = value.as_bytes().first().is_some_and(u8::is_ascii_uppercase)
        && value
            .bytes()
            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'_');
    if (matches!(kind, MdxExpressionKind::Expression)
        && (constant || serde_json::from_str::<String>(value).is_ok()))
        || (matches!(kind, MdxExpressionKind::AttributeValueExpression)
            && serde_json::from_str::<Vec<String>>(value).is_ok())
    {
        MdxSignal::Ok
    } else {
        use_reference_parser()
    }
}

fn parse_options(mdx: bool) -> ParseOptions {
    if !mdx {
        return ParseOptions::gfm();
    }
    ParseOptions {
        constructs: Constructs {
            gfm_autolink_literal: true,
            gfm_footnote_definition: true,
            gfm_label_start_footnote: true,
            gfm_strikethrough: true,
            gfm_table: true,
            gfm_task_list_item: true,
            ..Constructs::mdx()
        },
        // The JS entry validates each complete import block with remark before accepting its outline.
        mdx_esm_parse: Some(Box::new(|value| {
            if value.lines().all(|l| l.starts_with("import ")) {
                MdxSignal::Ok
            } else {
                use_reference_parser()
            }
        })),
        mdx_expression_parse: Some(Box::new(validate_expression)),
        ..Default::default()
    }
}

// markdown-rs 1.0.0 assumes the heading is on top of the AST stack at a Setext
// underline. An open inline JSX element in that paragraph violates the assumption.
// Leave the diagnostic to remark before entering the Wasm parser.
fn parse_tree(source: &str, mdx: bool) -> Option<Node> {
    let first_tag = if mdx { source.find('<') } else { None };
    if let Some(start) = first_tag {
        let mut paragraph_has_tag = false;
        for line in source[start..].lines().flat_map(|line| line.split('\r')) {
            let line = line.trim_end_matches([' ', '\t']);
            if paragraph_has_tag && line.ends_with(['-', '=']) {
                // Checking the suffix also covers underlines nested in lists and block quotes.
                return None;
            }
            paragraph_has_tag = !line.is_empty() && (paragraph_has_tag || line.contains('<'));
        }
    }
    let root = to_mdast(source, &parse_options(mdx)).ok()?;
    if first_tag.is_some() {
        // markdown-rs can emit malformed JSX as ordinary text. Let remark decide
        // whether the opener is legal, even if it occurs outside the requested outline.
        let mut pending = vec![&root];
        while let Some(node) = pending.pop() {
            if let Node::Text(text) = node
                && text.value.contains('<')
            {
                return None;
            }
            if let Some(children) = node.children() {
                pending.extend(children);
            }
        }
    }
    Some(root)
}

fn needs_reference_inline(source: &str) -> bool {
    // The parsers differ on literal leading hashes, nested image alt text and escaped autolinks.
    let label = source
        .trim_start_matches('#')
        .trim_start_matches([' ', '\t']);
    (source.starts_with('#') && label.starts_with('#'))
        || source.contains("![")
        || (source.contains('@') && source.contains('\\'))
}

fn encode(root: &Node, source: &str, ignored: &[String]) -> Option<String> {
    let mut pending = vec![(root, true)];
    let mut outline = Vec::new();
    let mut imports = Vec::new();
    while let Some((node, visible)) = pending.pop() {
        let name = match node {
            Node::MdxJsxFlowElement(element) => element.name.as_ref(),
            Node::MdxJsxTextElement(element) => element.name.as_ref(),
            _ => None,
        };
        let visible = visible && !name.is_some_and(|name| ignored.contains(name));
        match node {
            Node::MdxjsEsm(esm) => imports.push(&esm.value),
            Node::Heading(heading) if visible => {
                let position = heading.position.as_ref()?;
                let heading_source = source.get(position.start.offset..position.end.offset)?;
                if needs_reference_inline(heading_source) {
                    return None;
                }
                outline.push(node);
            }
            Node::Definition(_) if visible => outline.push(node),
            _ => {
                if let Some(children) = node.children() {
                    pending.extend(children.iter().rev().map(|child| (child, visible)));
                }
            }
        }
    }
    Some(serde_json::to_string(&(outline, imports)).expect("Markdown nodes serialize to JSON"))
}

#[wasm_bindgen]
pub fn outline(source: &str, mdx: bool, ignored: Vec<String>) -> Option<String> {
    if let Some(result) = flat::outline(source) {
        return Some(result);
    }
    if let Some(projected) = projection::Projection::new(source)
        && !projected.text.contains("]:")
        && let Some(root) = parse_tree(&projected.text, mdx)
        && projected.verified(&root)
    {
        return encode(&root, &projected.text, &ignored);
    }
    if source.contains("]:") {
        return None;
    }
    let tree = parse_tree(source, mdx)?;
    encode(&tree, source, &ignored)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defers_ambiguous_mdx_text_but_accepts_literal_code_and_jsx() {
        assert!(parse_tree("<", true).is_none());
        assert!(parse_tree("<", false).is_some());
        assert!(parse_tree("<Guide>\n\n`<`\n\n</Guide>", true).is_some());
    }

    #[test]
    fn accepts_json_string_lists_only_as_attribute_values() {
        let literal = r#"<Tabs items={["one", "two"]}>

# Visible

</Tabs>"#;
        assert!(outline(literal, true, vec![]).unwrap().contains("Visible"));
        for source in [
            "<A x={run()} />",
            "<A {...props} />",
            "export const x = 1",
            "{",
        ] {
            assert!(outline(source, true, vec![]).is_none(), "{source}");
        }
    }

    #[test]
    fn omits_fences_and_ignored_component_subtrees() {
        let input = "<Example>\n\n# Hidden\n\n</Example>\n\n```md\n# Code\n```\n\n# Visible";
        let result = outline(input, true, vec!["Example".into()]).unwrap();
        assert!(result.contains("Visible"));
        assert!(!result.contains("Hidden"));
        assert!(!result.contains("Code"));
    }
}
