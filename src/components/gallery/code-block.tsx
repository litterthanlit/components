import { codeToHtml } from "shiki";
import { CopyButton } from "@/registry/components/copy-button";

/** Server-rendered, dual-theme syntax highlighting. Zero client JS beyond the copy button. */
export async function CodeBlock({ code, filename }: { code: string; filename: string }) {
  const html = await codeToHtml(code, {
    lang: "tsx",
    themes: { light: "github-light", dark: "github-dark-default" },
    defaultColor: false,
  });

  return (
    <figure className="overflow-hidden rounded-xl bg-panel shadow-[inset_0_0_0_1px_var(--line)]">
      <figcaption className="flex items-center justify-between border-b border-line py-1 pl-4 pr-1">
        <span className="font-mono text-meta text-muted">{filename}</span>
        <CopyButton value={code} label={`Copy ${filename}`} />
      </figcaption>
      <div
        className="code max-h-[32rem] overflow-auto text-[12.5px] leading-[1.7] [&_pre]:min-w-max [&_pre]:p-4 [&_pre]:!bg-transparent"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </figure>
  );
}
