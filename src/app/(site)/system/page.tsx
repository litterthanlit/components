import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MotionDemo } from "@/components/system/motion-demo";
import { SpringDemo } from "@/components/system/spring-demo";
import { Badge, Button, Container, Dot, IconButton, Kbd, SectionLabel } from "@/design-system";
import { colorRoles, colors, motion, radii, typeScale } from "@/design-system/tokens";

export const metadata: Metadata = {
  title: "System",
  description: "The design system behind litt.design and this gallery: tokens, type, motion and primitives.",
};

const principles = [
  { title: "Quiet by default", body: "Grey text, hairline borders, one weight change. The work should be the loudest thing on the page." },
  { title: "One accent, used as a signal", body: "Blue marks status and moments of success. Use it as a fill or a link-weight highlight, never for body copy." },
  { title: "Motion responds, it doesn't perform", body: "Anything that reacts to input is fast and eases out. Exits are quicker than entrances." },
  { title: "Objects get a ring, not a box", body: "Raised things use a 1px ring plus a soft shadow. Flat areas use a panel tint, not a border." },
];

const sections = [
  { id: "principles", label: "Principles" },
  { id: "color", label: "Color" },
  { id: "type", label: "Type" },
  { id: "shape", label: "Shape" },
  { id: "motion", label: "Motion" },
  { id: "primitives", label: "Primitives" },
  { id: "writing", label: "Writing" },
];

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-8 border-t border-line pt-6">
      <div className="grid gap-6 lg:grid-cols-[200px_1fr] lg:gap-10">
        <div>
          <SectionLabel id={`${id}-heading`} className="text-ink">
            {title}
          </SectionLabel>
          {intro && <p className="mt-1 text-meta text-muted">{intro}</p>}
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
      <header className="max-w-[560px] pb-16 pt-12 sm:pt-24">
        <h1 className="text-body">
          <span className="font-medium text-ink">System</span>
          <span className="text-muted"> · v1.0</span>
        </h1>
        <p className="mt-3 text-lead text-ink">
          The rules behind litt.design and this gallery. Tokens live in{" "}
          <code className={code}>src/design-system/tokens.css</code>, primitives in{" "}
          <code className={code}>src/design-system/primitives</code>.
        </p>
        <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-body">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="text-muted transition-colors duration-(--duration-exit) hover:text-ink hover:duration-(--duration-enter)">
              {s.label}
            </a>
          ))}
        </nav>
      </header>

      <div className="flex flex-col gap-20">
        <Section id="principles" title="Principles">
          <ol className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {principles.map((p, i) => (
              <li key={p.title}>
                <p className="text-body font-medium text-ink">
                  <span className="mr-2 tabular-nums text-subtle">{i + 1}</span>
                  {p.title}
                </p>
                <p className="mt-1 text-body text-muted">{p.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="color" title="Color" intro="Neutral grounds, three text greys, one accent. Every value is a token with a light and dark definition.">
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

        <Section id="type" title="Type" intro="Geist Sans for everything, Geist Mono for code and figures. Small sizes, tight tracking, weight 400 and 500 only.">
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
                  className="min-w-0 text-ink"
                  style={{ fontSize: t.size, lineHeight: t.leading, letterSpacing: t.tracking, fontWeight: t.weight }}
                >
                  {t.use}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="shape" title="Shape" intro="Radii grow with object size. Elevation is a hairline ring plus a soft shadow, never a heavy drop.">
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
            <li>
              Agent shapes: <code className={code}>animate-stretch</code> for rays,{" "}
              <code className={code}>animate-trace</code> to run a dash along a path (set{" "}
              <code className={code}>pathLength={"{1}"}</code>), <code className={code}>animate-morph</code> for a form
              changing shape, <code className={code}>animate-assemble</code> for tiles folding out along{" "}
              <code className={code}>--fx</code> / <code className={code}>--fy</code>,{" "}
              <code className={code}>animate-twist</code> to turn a layer a quarter at a time, and{" "}
              <code className={code}>animate-build</code>, which runs a shared <code className={code}>--build</code>{" "}
              value from 0 to 1 and back for children to read. Offset siblings with negative delays so a loop never
              starts at rest.
            </li>
            <li>Press feedback: <code className={code}>active:scale-[0.97]</code> on anything clickable.</li>
            <li>Hover in at enter speed, out at exit speed, so the UI never lags behind the pointer.</li>
            <li>Never animate from <code className={code}>scale(0)</code>. Start at 0.95 or more with opacity.</li>
            <li>Respect reduced motion: transitions collapse to instant, autoplay media shows a still.</li>
          </ul>
        </Section>

        <Section id="primitives" title="Primitives" intro="The small set the gallery is built from. Import from @/design-system.">
          <div className="grid gap-4 md:grid-cols-2">
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
              ["Sentence case everywhere", "“Selected work”, not “SELECTED WORK” or “Selected Work”."],
              ["Labels say what happens", "“Copy command”, then “Copied”. Not “Submit” or “OK”."],
              ["Short and plain", "Write it the way you'd say it to someone at the next desk."],
              ["Parentheses for status", "“Carson (In progress)”. A blue dot comes with it."],
            ].map(([title, body]) => (
              <li key={title}>
                <p className="font-medium text-ink">{title}</p>
                <p className="text-muted">{body}</p>
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
    <figure className="flex flex-col overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_var(--line)]">
      <div className="flex min-h-28 flex-wrap items-center justify-center gap-2 bg-panel p-6">{children}</div>
      <figcaption className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
        <span className="text-body font-medium text-ink">{label}</span>
        <code className="truncate font-mono text-meta text-muted">{usage}</code>
      </figcaption>
    </figure>
  );
}
