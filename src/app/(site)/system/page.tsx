import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MotionDemo } from "@/components/system/motion-demo";
import { SpringDemo } from "@/components/system/spring-demo";
import { Badge, Button, Container, Dot, Halftone, IconButton, Kbd, Label, Plate } from "@/design-system";
import { colorRoles, colors, density, legend, motion, radii, typeScale } from "@/design-system/tokens";

export const metadata: Metadata = {
  title: "System",
  description: "The method behind this gallery: a proof-sheet metaphor, a halftone filter, crop marks, three type voices and a four-colour legend.",
};

const method = [
  { term: "Myth", value: "Every component is a proof pulled from the press: inked, checked, then pinned to the wall before it ships." },
  { term: "Metaphor", value: "The print-shop proof sheet. Paper, ink, slug lines, plates." },
  { term: "Filter", value: "Halftone. Imagery is printed as an amplitude-modulated dot screen, never a soft photo or a plastic gradient." },
  { term: "Habit", value: "Crop marks. Four printer's ticks hold every plate, loader, empty state and stage. They turn proof red when a plate is live." },
  { term: "Volume", value: "Mid. Tight palette, card on bleed, three voices, grain on the paper. Quiet enough that the work stays loudest." },
];

const principles = [
  { title: "Methods over marks", body: "Build with the metaphor, the filter and the habit. They stretch to any surface; a one-off flourish doesn't." },
  { title: "Colour is a legend", body: "Four hues, each with one meaning. Lime is live, proof red is look here. Emphasis comes from ink density, not new colours." },
  { title: "Three voices, always", body: "Serif tells the story, sans runs the product, mono carries the metadata. Keep all three even on a quiet page." },
  { title: "Design every state", body: "Empty, loading, dense, misprint and proof, not just the hero. Each one still sits inside its crop marks." },
  { title: "Stage it on paper", body: "Components are shown on a sheet, on a table, under a print. No floating in a digital void." },
  { title: "Motion responds, it doesn't perform", body: "Anything that reacts to input is fast and eases out. Exits are quicker than entrances." },
];

const rejects = [
  { what: "Pastel colour washes behind the page", why: "Three extra hues with no meaning. Replaced by paper grain." },
  { what: "Lime glow stage", why: "Lime means live; as decoration it lied. Replaced by an ink halftone bloom." },
  { what: "Frosted glass chips", why: "Glass with no metaphor. Kept only where a label sits on a print, like a sticker on a proof." },
  { what: "One font for everything", why: "Geist alone flattened story and metadata into the UI voice." },
];

const sections = [
  { id: "method", label: "Method" },
  { id: "principles", label: "Principles" },
  { id: "color", label: "Color" },
  { id: "type", label: "Type" },
  { id: "shape", label: "Shape" },
  { id: "motion", label: "Motion" },
  { id: "primitives", label: "Primitives" },
  { id: "writing", label: "Writing" },
  { id: "rejects", label: "Rejects" },
];

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-8 border-t border-line pt-6">
      <div className="grid gap-6 lg:grid-cols-[240px_1fr] lg:gap-12">
        <div>
          <h2 id={`${id}-heading`} className="font-display text-heading text-ink">
            {title}
          </h2>
          {intro && <p className="mt-2 text-meta text-muted">{intro}</p>}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

function Swatches({ theme }: { theme: "light" | "dark" }) {
  const values = colors[theme];
  return (
    <div data-theme={theme} className="rounded-xl bg-canvas p-2 text-ink shadow-[inset_0_0_0_1px_var(--line)]">
      <p className="px-2 pb-2 pt-1 text-meta text-muted">{theme === "light" ? "Light" : "Dark"}</p>
      <ul className="flex flex-col">
        {colorRoles.map(({ token }) => (
          <li key={token} className="flex items-center gap-3 rounded-md px-2 py-1.5">
            <span
              aria-hidden
              className="size-6 shrink-0 rounded-sm shadow-[inset_0_0_0_1px_var(--line-strong)]"
              style={{ background: `var(--${token})` }}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-meta">{token}</span>
            <span className="font-mono text-meta tabular-nums text-muted">{values[token]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Full class names so Tailwind can see them.
const shadowClass = { sm: "shadow-sm", md: "shadow-md", lg: "shadow-lg" } as const;

const code = "rounded-sm bg-panel px-1 py-0.5 font-mono text-[12px] text-ink";

export default function SystemPage() {
  return (
    <Container>
      <header className="max-w-[720px] pb-20 pt-12 sm:pt-24">
        <Label as="p">System · v2.0 · Proof sheet</Label>
        <h1 className="mt-4 font-display text-headline text-ink">
          A method, <em className="text-muted">not a mark.</em>
        </h1>
        <p className="mt-6 max-w-[56ch] text-lead text-muted">
          The rules behind this gallery. Tokens live in <code className={code}>src/design-system/tokens.css</code>,
          primitives in <code className={code}>src/design-system/primitives</code>.
        </p>
        <nav aria-label="On this page" className="mt-8 flex flex-wrap gap-x-4 gap-y-1">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="font-mono text-label uppercase text-muted transition-colors duration-(--duration-exit) hover:text-ink hover:duration-(--duration-enter)"
            >
              {s.label}
            </a>
          ))}
        </nav>
      </header>

      <div className="flex flex-col gap-20">
        <Section id="method" title="Method" intro="Write the myth first, then pick one metaphor and one filter, then draw the habit. Pour complexity in last.">
          <dl className="divide-y divide-line border-y border-line">
            {method.map((m) => (
              <div key={m.term} className="grid gap-1 py-4 sm:grid-cols-[120px_1fr] sm:gap-6">
                <Label as="dt" className="pt-1 text-ink">
                  {m.term}
                </Label>
                <dd className="text-body text-muted">{m.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-10 grid gap-10 sm:grid-cols-2">
            <figure>
              <Plate className="grid h-40 place-items-center rounded-xl bg-panel">
                <span className="font-mono text-label uppercase text-muted">.crop</span>
              </Plate>
              <figcaption className="mt-5 text-meta text-muted">The habit. Marks sit outside the box and turn proof red on hover or focus.</figcaption>
            </figure>
            <figure>
              <div className="relative isolate h-40 overflow-hidden rounded-xl bg-panel shadow-[inset_0_0_0_1px_var(--line)]">
                <Halftone
                  image="radial-gradient(circle at 70% 50%, #9c9c9c 0, #a8a8a8 16%, #fff 46%), linear-gradient(90deg, #fff, #ddd)"
                  pitch={6}
                  density={0.7}
                  className="absolute inset-0"
                />
              </div>
              <figcaption className="mt-5 text-meta text-muted">The filter. A grey image times a dot screen, thresholded, so dark areas print bigger dots.</figcaption>
            </figure>
          </div>
        </Section>

        <Section id="principles" title="Principles">
          <ol className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {principles.map((p, i) => (
              <li key={p.title}>
                <p className="text-body font-medium text-ink">
                  <span className="mr-2 font-mono text-label tabular-nums text-proof">{String(i + 1).padStart(2, "0")}</span>
                  {p.title}
                </p>
                <p className="mt-1 text-body text-muted">{p.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="color" title="Color" intro="A legend, not decoration. Four hues, each with one job. Every token has a paper and a darkroom value.">
          <ul className="mb-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line shadow-[inset_0_0_0_1px_var(--line)] lg:grid-cols-4">
            {legend.map((l) => (
              <li key={l.token} className="flex flex-col bg-surface">
                <span aria-hidden className="h-20 shadow-[inset_0_-1px_0_var(--line)]" style={{ background: `var(--${l.token})` }} />
                <div className="p-4">
                  <Label as="p" className="text-ink">
                    {l.name}
                  </Label>
                  <p className="mt-1 text-meta text-muted">{l.meaning}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-body font-medium text-ink">Density dial</p>
          <p className="mb-4 mt-1 max-w-[560px] text-body text-muted">
            Need more emphasis? Turn the screen up before reaching for a fifth hue. Opacity and pitch are the dial.
          </p>
          <ul className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {density.map((d) => (
              <li key={d.step}>
                <div className="relative isolate h-20 overflow-hidden rounded-lg bg-panel shadow-[inset_0_0_0_1px_var(--line)]">
                  <div
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                      backgroundImage: `radial-gradient(color-mix(in oklab, var(--ink) ${d.opacity * 100}%, transparent) 1.3px, transparent 1.7px)`,
                      backgroundSize: `${d.pitch}px ${d.pitch}px`,
                    }}
                  />
                </div>
                <Label as="p" className="mt-2 text-ink">
                  {d.step} · {Math.round(d.opacity * 100)}% / {d.pitch}px
                </Label>
                <p className="text-meta text-muted">{d.use}</p>
              </li>
            ))}
          </ul>
          <div className="grid gap-4 md:grid-cols-2">
            <Swatches theme="light" />
            <Swatches theme="dark" />
          </div>
          <dl className="mt-6 grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {colorRoles.map(({ token, role }) => (
              <div key={token} className="flex gap-3 text-body">
                <dt className="w-28 shrink-0 font-mono text-meta leading-[1.6] text-ink">{token}</dt>
                <dd className="text-muted">{role}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="type" title="Type" intro="Three voices. Instrument Serif tells the story, Geist runs the product, Geist Mono carries the metadata.">
          <ul className="mb-10 grid gap-4 sm:grid-cols-3">
            {[
              { voice: "Display", family: "Instrument Serif", cls: "font-display text-[2.5rem] leading-none", sample: "Proof № 07" },
              { voice: "UI", family: "Geist", cls: "font-sans text-title font-medium", sample: "Send notification" },
              { voice: "Metadata", family: "Geist Mono", cls: "font-mono text-label uppercase", sample: "Build 4f2a1c · 12ms" },
            ].map((v) => (
              <li key={v.voice} className="flex flex-col justify-between gap-6 rounded-xl bg-surface p-5 shadow-sm">
                <p className={`text-ink ${v.cls}`}>{v.sample}</p>
                <div>
                  <Label as="p" className="text-ink">
                    {v.voice}
                  </Label>
                  <p className="text-meta text-muted">{v.family}</p>
                </div>
              </li>
            ))}
          </ul>
          <ul className="flex flex-col divide-y divide-line">
            {typeScale.map((t) => (
              <li key={t.token} className="grid gap-2 py-4 first:pt-0 sm:grid-cols-[140px_1fr] sm:items-baseline">
                <div className="font-mono text-meta text-muted">
                  <p className="text-ink">text-{t.token}</p>
                  <p>
                    {t.size}/{t.leading} · {t.tracking}
                  </p>
                </div>
                <p
                  className={`min-w-0 text-ink ${t.font === "display" ? "font-display" : t.font === "mono" ? "font-mono uppercase" : ""}`}
                  style={{ fontSize: Math.min(t.size, 64), lineHeight: t.leading, letterSpacing: t.tracking, fontWeight: t.weight }}
                >
                  {t.use}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="shape" title="Shape" intro="Paper has a small corner, so radii stay tight. Elevation is a sheet on a table: a hairline ring and a low, warm shadow.">
          <div className="grid gap-4 sm:grid-cols-2">
            <ul className="grid grid-cols-2 gap-3">
              {radii.map((r) => (
                <li key={r.token} className="flex flex-col gap-2">
                  <span
                    aria-hidden
                    className="h-16 bg-surface shadow-sm"
                    style={{ borderRadius: r.px }}
                  />
                  <span className="font-mono text-meta text-ink">
                    rounded-{r.token} <span className="text-muted">{r.px}px</span>
                  </span>
                  <span className="text-meta text-muted">{r.use}</span>
                </li>
              ))}
            </ul>
            <ul className="grid grid-cols-1 gap-3 rounded-xl bg-panel p-4 shadow-[inset_0_0_0_1px_var(--line)]">
              {(["sm", "md", "lg"] as const).map((s) => (
                <li key={s} className="flex items-center gap-3">
                  <span aria-hidden className={`h-12 w-20 shrink-0 rounded-lg bg-surface ${shadowClass[s]}`} />
                  <span className="font-mono text-meta text-ink">shadow-{s}</span>
                  <span className="text-meta text-muted">
                    {s === "sm" ? "Buttons, chips" : s === "md" ? "Cards, inputs" : "Menus, toasts, dialogs"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section id="motion" title="Motion" intro="Curves after Emil Kowalski, durations from litt.design. Ease out for anything triggered by the user.">
          <MotionDemo curves={motion.curves} />
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {motion.durations.map((d) => (
              <li key={d.token}>
                <p className="font-mono text-meta text-ink">
                  --{d.token} <span className="text-muted">{d.ms}ms</span>
                </p>
                <p className="text-meta text-muted">{d.use}</p>
              </li>
            ))}
          </ul>
          <div className="mt-10">
            <p className="text-body font-medium text-ink">Springs</p>
            <p className="mb-4 mt-1 max-w-[560px] text-body text-muted">
              Use a spring when motion follows the pointer or can be interrupted: magnetic elements, indicators,
              anything dragged. Values go straight to the DOM through <code className={code}>createSpring</code>, so
              nothing re-renders.
            </p>
            <SpringDemo />
          </div>
          <ul className="mt-6 flex flex-col gap-1.5 text-body text-muted">
            <li>
              Stagger siblings that enter together by <code className={code}>--stagger</code> (50ms), capped at 8, so a
              long list never waits on its last item.
            </li>
            <li>
              Agent states: <code className={code}>animate-shimmer</code> for a working label,{" "}
              <code className={code}>animate-wave</code> and <code className={code}>animate-hop</code> for pixels and
              dots, <code className={code}>animate-caret</code> while text streams. Announce phases to screen readers, not
              tokens.
            </li>
            <li>Press feedback: <code className={code}>active:scale-[0.97]</code> on anything clickable.</li>
            <li>Hover in at enter speed, out at exit speed, so the UI never lags behind the pointer.</li>
            <li>Never animate from <code className={code}>scale(0)</code>. Start at 0.95 or more with opacity.</li>
            <li>Respect reduced motion: transitions collapse to instant, autoplay media shows a still.</li>
          </ul>
        </Section>

        <Section id="primitives" title="Primitives" intro="The small set the gallery is built from. Import from @/design-system.">
          <div className="grid gap-10 md:grid-cols-2">
            <Specimen label="Button" usage='<Button variant="primary">'>
              <Button variant="primary">Publish</Button>
              <Button>Cancel</Button>
              <Button variant="ghost">Skip</Button>
              <Button size="sm">Small</Button>
            </Specimen>
            <Specimen label="IconButton" usage='<IconButton label="Search">'>
              <IconButton label="Search">
                <svg aria-hidden viewBox="0 0 16 16" fill="none" className="size-4">
                  <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </IconButton>
              <IconButton label="Add" size="sm">
                <svg aria-hidden viewBox="0 0 16 16" fill="none" className="size-3.5">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </IconButton>
            </Specimen>
            <Specimen label="Badge and Dot" usage='<Badge variant="accent">'>
              <Badge>motion</Badge>
              <Badge variant="solid">Draft</Badge>
              <Badge variant="accent">Shipped</Badge>
              <span className="inline-flex items-center gap-1.5 text-body text-ink">
                <Dot pulse /> Available
              </span>
            </Specimen>
            <Specimen label="Kbd" usage="<Kbd>⌘</Kbd>">
              <span className="inline-flex items-center gap-1 text-body text-muted">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
                <span className="ml-1">to search</span>
              </span>
            </Specimen>
          </div>
        </Section>

        <Section id="writing" title="Writing">
          <ul className="grid gap-x-8 gap-y-3 text-body sm:grid-cols-2">
            {[
              ["Sentence case for words", "“Selected work”, not “Selected Work”. Uppercase is only for mono slug lines: “NO. 07 · OCT 02”."],
              ["Labels say what happens", "“Copy command”, then “Copied”. Not “Submit” or “OK”."],
              ["Short and plain", "Write it the way you'd say it to someone at the next desk."],
              ["Speak print", "Plates, proofs, pulls, misprints. The metaphor names the states, so “Nothing pulled” beats “No results”."],
            ].map(([title, body]) => (
              <li key={title}>
                <p className="font-medium text-ink">{title}</p>
                <p className="text-muted">{body}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="rejects" title="Rejects" intro="Kept on purpose. Taste sharpens by contrast, so each kill is written down with its reason.">
          <ul className="divide-y divide-line border-y border-line">
            {rejects.map((r) => (
              <li key={r.what} className="grid gap-1 py-4 sm:grid-cols-[1fr_1.2fr] sm:gap-6">
                <p className="text-body text-ink line-through decoration-proof decoration-1">{r.what}</p>
                <p className="text-body text-muted">{r.why}</p>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </Container>
  );
}

function Specimen({ label, usage, children }: { label: string; usage: string; children: ReactNode }) {
  return (
    <Plate className="flex flex-col rounded-xl shadow-[inset_0_0_0_1px_var(--line)]">
      <div className="flex min-h-28 flex-wrap items-center justify-center gap-2 rounded-t-xl bg-panel p-6">{children}</div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
        <Label className="text-ink">{label}</Label>
        <code className="truncate font-mono text-meta text-muted">{usage}</code>
      </div>
    </Plate>
  );
}
