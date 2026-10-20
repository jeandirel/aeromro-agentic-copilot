import type { ReactNode } from "react";

/**
 * Renders language-model text with the few Markdown marks models emit despite the "plain text"
 * instruction (**bold**, bullet and numbered lists, # headings). Everything is built from React
 * text nodes: no HTML from the model is ever interpreted, so the output cannot inject markup.
 */
const LIST_ITEM = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

function inline(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*\n]+\*\*|__[^_\n]+__)/g);
  return parts.map((part, i) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(part) ?? /^__([^_]+)__$/.exec(part);
    return bold ? (
      <strong key={`${keyBase}-${i}`} className="font-semibold">
        {bold[1]}
      </strong>
    ) : (
      part
    );
  });
}

type Block = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] } | { kind: "h"; text: string };

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const last = blocks[blocks.length - 1];
    if (!line.trim()) {
      blocks.push({ kind: "p", lines: [] });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "h", text: heading[1]! });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      const kind = item[1] ? "ol" : "ul";
      if (last && last.kind === kind) last.items.push(item[2]!);
      else blocks.push({ kind, items: [item[2]!] });
      continue;
    }
    if (last && last.kind === "p") last.lines.push(line.trim());
    else blocks.push({ kind: "p", lines: [line.trim()] });
  }
  return blocks.filter((b) => (b.kind === "p" ? b.lines.length > 0 : true));
}

export function stripMarks(text: string): string {
  return text.replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/__([^_\n]+)__/g, "$1").replace(/^\s*#{1,6}\s+/gm, "");
}

export function GeneratedText({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        if (b.kind === "h") return <p key={i} className="font-semibold">{inline(b.text, `h${i}`)}</p>;
        if (b.kind === "ul" || b.kind === "ol") {
          const List = b.kind;
          return (
            <List key={i} className={b.kind === "ul" ? "list-disc space-y-1 pl-5 marker:text-ink-3" : "list-decimal space-y-1 pl-5 marker:text-ink-3"}>
              {b.items.map((item, j) => (
                <li key={j}>{inline(item, `${i}-${j}`)}</li>
              ))}
            </List>
          );
        }
        if (b.kind !== "p") return null;
        return (
          <p key={i}>
            {b.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {inline(line, `${i}-${j}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
