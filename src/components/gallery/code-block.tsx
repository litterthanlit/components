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
    <figure className="overflow-hidden rounded-2xl border border-border bg-surface">
      <figcaption className="flex items-center justify-between border-b border-border py-1.5 pl-4 pr-1.5">
        <span className="font-mono text-xs text-muted">{filename}</span>
        <CopyButton value={code} label={`Copy ${filename}`} />
      </figcaption>
      <div
        className="code max-h-[36rem] overflow-auto text-[13px] leading-relaxed [&_pre]:min-w-max [&_pre]:p-5 [&_pre]:!bg-transparent"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </figure>
  );
}
