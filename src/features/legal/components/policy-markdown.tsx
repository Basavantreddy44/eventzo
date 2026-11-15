import { Fragment, type ReactNode } from "react";

/**
 * Renders the small Markdown subset used in policy texts (## headings,
 * paragraphs, "- " lists, | tables |, **bold**) as React elements. No raw
 * HTML is ever injected.
 */
export function PolicyMarkdown({ source }: { source: string }) {
  const blocks = source.trim().split(/\n\s*\n/);
  return (
    <div className="grid gap-4 text-sm leading-relaxed">
      {blocks.map((block, i) => (
        <Fragment key={i}>{renderBlock(block.trim())}</Fragment>
      ))}
    </div>
  );
}

function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
    );
}

function renderBlock(block: string): ReactNode {
  const lines = block.split("\n");
  if (block.startsWith("### ")) return <h3 className="mt-2 font-semibold">{inline(block.slice(4))}</h3>;
  if (block.startsWith("## ")) return <h2 className="mt-4 text-lg font-semibold">{inline(block.slice(3))}</h2>;
  if (lines.every((l) => l.startsWith("- ")))
    return (
      <ul className="grid list-disc gap-1 pl-5">
        {lines.map((l, i) => (
          <li key={i}>{inline(l.slice(2))}</li>
        ))}
      </ul>
    );
  if (lines.length >= 2 && lines.every((l) => l.trim().startsWith("|"))) {
    const cells = (l: string) =>
      l
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim());
    const [head, , ...rows] = lines;
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              {cells(head).map((c, i) => (
                <th key={i} className="border-b px-2 py-1.5 font-medium">
                  {inline(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {cells(r).map((c, j) => (
                  <td key={j} className="border-b px-2 py-1.5">
                    {inline(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return <p>{inline(lines.join(" "))}</p>;
}
