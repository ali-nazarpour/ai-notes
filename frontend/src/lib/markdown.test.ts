import { describe, expect, it } from "vitest";

import { markdownToContent, parseInline, plainTextToDoc } from "./markdown";

describe("markdownToContent", () => {
  it("turns headings, lists and paragraphs into editor nodes", () => {
    const nodes = markdownToContent("# Title\n\n- one\n- two\n\nText");
    expect(nodes.map((n) => n.type)).toEqual(["heading", "bulletList", "paragraph"]);
    expect(nodes[0].attrs).toMatchObject({ level: 1 });
    expect(nodes[1].content).toHaveLength(2);
  });

  it("keeps fenced code as a code block with its language", () => {
    const [block] = markdownToContent("```python\nprint('hi')\n```");
    expect(block.type).toBe("codeBlock");
    expect(block.attrs).toMatchObject({ language: "python" });
    expect(block.content?.[0].text).toBe("print('hi')");
  });

  it("parses inline bold, italic and code marks", () => {
    const parts = parseInline("a **b** *c* `d`");
    const marked = parts.filter((p) => p.marks?.length).map((p) => [p.text, p.marks?.[0].type]);
    expect(marked).toEqual([
      ["b", "bold"],
      ["c", "italic"],
      ["d", "code"],
    ]);
  });
});

describe("plainTextToDoc", () => {
  it("makes a paragraph per blank-line block and keeps single line breaks", () => {
    const doc = plainTextToDoc(["first", "line two", "", "second"].join("\n"));
    expect(doc.type).toBe("doc");
    expect(doc.content).toHaveLength(2);
    expect(doc.content?.[0].content?.map((n) => n.type)).toEqual(["text", "hardBreak", "text"]);
  });
});
