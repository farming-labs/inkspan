//! Replace opaque block bodies with shorter text while preserving every source line.
//! The caller checks every replacement against the parsed block tree before using the outline.
use markdown::mdast::Node;
use std::collections::HashSet;

#[derive(Clone, Copy, Eq, Hash, PartialEq)]
enum Block {
    Code,
    Paragraph,
    TableRow,
}

pub struct Projection {
    pub text: String,
    expected: HashSet<(Block, usize, usize)>,
}

pub(super) fn fence(line: &str) -> Option<(u8, usize)> {
    let marker = *line.as_bytes().first()?;
    if !matches!(marker, b'`' | b'~') {
        return None;
    }
    let width = line.bytes().take_while(|byte| *byte == marker).count();
    (width >= 3 && (marker != b'`' || !line[width..].contains('`'))).then_some((marker, width))
}

pub(super) fn closes_fence(line: &str, marker: u8, width: usize) -> bool {
    // MDX permits a closing fence indented beyond CommonMark's three spaces.
    // Consider every possible closer. The tree confirms its actual span.
    let content = line.trim_matches([' ', '\t']);
    content.len() >= width && content.bytes().all(|byte| byte == marker)
}

fn safe_prose(line: &str) -> bool {
    line.as_bytes().first().is_some_and(u8::is_ascii_alphabetic)
        && !line.starts_with("import")
        && !line.starts_with("export")
        && !line.contains(['<', '>', '{', '}', '|'])
        && !line.contains("]:")
}

fn pipe_row(line: &str) -> bool {
    line.starts_with('|') && line.trim_end().ends_with('|')
}

fn table_delimiter(line: &str) -> bool {
    pipe_row(line)
        && line.contains('-')
        && line
            .bytes()
            .all(|b| matches!(b, b'|' | b':' | b'-' | b' ' | b'\t'))
}

impl Projection {
    pub fn new(source: &str) -> Option<Self> {
        // Bare CR is a Markdown line break as well. Keep the original parser for mixed endings.
        if !source.contains('\n') || source.contains('\r') {
            return None;
        }
        let lines: Vec<_> = source.split('\n').collect();
        let mut text = String::with_capacity(source.len());
        let mut expected = HashSet::new();
        let mut i = 0;
        while i < lines.len() {
            if let Some((marker, width)) = fence(lines[i]) {
                let Some(end) =
                    (i + 1..lines.len()).find(|&j| closes_fence(lines[j], marker, width))
                else {
                    text.push_str(&lines[i..].join("\n"));
                    break;
                };
                text.push_str(lines[i]);
                text.push('\n');
                for _ in i + 1..end {
                    text.push('\n');
                }
                text.push_str(lines[end]);
                if end > i + 1 {
                    expected.insert((Block::Code, i + 1, end + 1));
                }
                i = end + 1;
            } else if i + 1 < lines.len() && pipe_row(lines[i]) && table_delimiter(lines[i + 1]) {
                text.push_str(lines[i]);
                text.push('\n');
                text.push_str(lines[i + 1]);
                i += 2;
                while i < lines.len() && pipe_row(lines[i]) {
                    text.push('\n');
                    if lines[i].contains(['<', '>', '{', '}']) || lines[i].contains("]:") {
                        text.push_str(lines[i]);
                    } else {
                        text.push_str("| x |");
                        expected.insert((Block::TableRow, i + 1, i + 1));
                    }
                    i += 1;
                }
            } else if (i == 0 || lines[i - 1].is_empty()) && safe_prose(lines[i]) {
                let start = i;
                while i < lines.len() && safe_prose(lines[i]) {
                    i += 1;
                }
                if i == lines.len() || lines[i].is_empty() {
                    text.push('x');
                    for _ in start + 1..i {
                        text.push_str("\nx");
                    }
                    expected.insert((Block::Paragraph, start + 1, i));
                } else {
                    text.push_str(&lines[start..i].join("\n"));
                }
            } else {
                text.push_str(lines[i]);
                i += 1;
            }
            if i < lines.len() {
                text.push('\n');
            }
        }
        (!expected.is_empty()).then_some(Self { text, expected })
    }

    pub fn verified(&self, root: &Node) -> bool {
        let mut matched = 0;
        let mut pending = vec![root];
        while let Some(node) = pending.pop() {
            let kind = match node {
                Node::Code(_) => Block::Code,
                Node::Paragraph(_) => Block::Paragraph,
                Node::TableRow(_) => Block::TableRow,
                // Only these ancestors allow an unprefixed, column-one block to continue unchanged.
                Node::Root(_) | Node::MdxJsxFlowElement(_) | Node::Table(_) => {
                    if let Some(children) = node.children() {
                        pending.extend(children);
                    }
                    continue;
                }
                _ => continue,
            };
            if let Some(pos) = node.position()
                && pos.start.column == 1
                && self
                    .expected
                    .contains(&(kind, pos.start.line, pos.end.line))
            {
                matched += 1;
            }
        }
        matched == self.expected.len()
    }
}

#[cfg(test)]
mod tests {
    use super::super::parse_options;
    use super::*;
    use markdown::to_mdast;

    #[test]
    fn proves_projected_blocks_before_accepting_them() {
        let source = "Title with *inline* text.\n\n| Column |\n| --- |\n| example |\n\n```rs\n# Hidden\n```\n\n## Visible";
        let projected = Projection::new(source).unwrap();
        assert!(!projected.text.contains("example"));
        assert!(!projected.text.contains("Hidden"));
        assert_eq!(source.lines().count(), projected.text.lines().count());
        assert!(projected.verified(&to_mdast(&projected.text, &parse_options(true)).unwrap()));
        let source = "<Box title=\"\n\nText within the attribute.\n\n\" />\n\n# Visible";
        let projected = Projection::new(source).unwrap();
        assert!(!projected.verified(&to_mdast(&projected.text, &parse_options(true)).unwrap()));
    }
}
