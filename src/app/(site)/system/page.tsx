import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { MaterialsPlate } from "@/components/system/materials";
import { MotionDemo } from "@/components/system/motion-demo";
import { SoundDemo } from "@/components/system/sound-demo";
import { SpringDemo } from "@/components/system/spring-demo";
import { Badge, Button, Container, Dot, IconButton, Kbd, SectionLabel } from "@/design-system";
import { colorRoles, colors, deviceVar, materials, motion, radii, typeScale } from "@/design-system/tokens";

export const metadata: Metadata = {
  title: "System",
  description: "The design system behind litt.design, this gallery and its player: tokens, type, hardware materials, motion, sound and the bar every study meets.",
};

const code = "rounded-sm bg-panel px-1 py-0.5 font-mono text-[12px] text-ink";

const principles = [
  {
    title: "An object, not a page",
    body: "The home page is a player you could hold: a body in a machined frame, wells pressed into it, keys that sink 2px. A study is a part of the same instrument, never a card on a screen.",
  },
  {
    title: "An instrument's vocabulary",
    body: "Takes, the tape, transport, slate, detents, scenes. Name things the way a field recorder would, and the interface explains itself.",
  },
  {
    title: "It runs by itself, and rewards the hand",
    body: "Everything moves in its first four seconds, untouched: a rehearsal, a recall, a ghost typing. A hand takes over at once, and the motor lets go.",
  },
  {
    title: "It makes sound",
    body: "Every press clicks, synthesized as it plays. What a study does by itself follows the player's tape; what the viewer does always sounds.",
  },
  {
    title: "Restraint, used as a signal",
    body: "Monochrome, plus red for REC and the playhead, orange for HOLD and one blue on the screen. Figures are tabular. The work is the loudest thing here.",
  },
  {
    title: "Physics carry the feel",
    body: "Springs that keep their velocity, motors against hands, detents, over-centre snaps, tape that winds by the square root and needles with VU ballistics. Where a mechanism exists, model it.",
  },
  {
    title: "Accessibility is native",
    body: "Real roles and ARIA patterns, one tab stop per composite, focus that follows the hand, changes said in live regions. Reduced motion stops anything that loops by itself.",
  },
  {
    title: "Product patterns, with the player's polish",
    body: "A study is something teams ship: a command menu, a 2FA field, a toast. The hardware is the polish; the pattern is the subject. The craft speaks for itself, with no explanatory chrome.",
  },
];

const sections = [
  { id: "principles", label: "Principles" },
  { id: "color", label: "Colour" },
  { id: "type", label: "Type" },
  { id: "shape", label: "Shape" },
  { id: "materials", label: "Materials" },
  { id: "motion", label: "Motion" },
  { id: "primitives", label: "Primitives" },
  { id: "sound", label: "Sound" },
  { id: "studies", label: "Studies" },
  { id: "writing", label: "Writing" },
];

/** The signal colours, and what each one is allowed to mean. */
const signals = [
  { token: "--device-rec", name: "Rec", use: "REC, PLAY, the playhead, a light that fires, a wrong code. The only red on the body." },
  { token: "--device-hold", name: "Hold", use: "A hand on a motor (TOUCH), an edited scene, a switched-on stripe." },
  { token: "--accent", name: "Accent", use: "Screens and pages, never the body: the highlight bar, the caret, a status dot." },
  { token: "--device-meter-on", name: "Lit", use: "Everything else that lights: meter segments, step keys, a knob's ring." },
];

/** The mechanisms the studies model, with their real numbers. */
const mechanisms = [
  {
    name: "Motor and hand",
    where: "Knob, Fader",
    numbers: "Values set from outside travel on a spring (the Knob on springs.gentle in degrees, the Fader on k 240 · c 30 in permille); the hand's land at once. A hand on the cap stops the motor; let go, and it takes the cap to wherever the value moved on to.",
  },
  {
    name: "Detents",
    where: "Knob, Fader, the dial, Tape Reels",
    numbers: "A click for every detent the spring passes, pitched with the value. The dial clicks every 15°, a reel every 30°. The Fader's unity detent catches within 1.2% of the range and lets go 3.5% clear.",
  },
  {
    name: "Over-centre",
    where: "Switch",
    numbers: "The cap lags the finger toward the centre (3% breakout, the snap at 72% of finger travel), then a spring of 40 preload plus 260 at its peak throws it to a hard stop (k 16000). Release projects the cap 150 ms ahead at the finger's speed: a flick decides by velocity.",
  },
  {
    name: "Tape",
    where: "Tape Reels",
    numbers: "A pack's radius grows with the square root of the tape on it, and each reel's angle comes out in closed form, θ = 2(r − r_hub) / k. Progress eases in on k 140 · c 24, critically damped: the reels have mass.",
  },
  {
    name: "VU ballistics",
    where: "VU Meter",
    numbers: "99% of a steady tone in about 300 ms with about 1.5% overshoot (k 166 · c 20.2). The peak light holds 600 ms past +3 VU. 0 VU is the slate tone, as measured leaving the bus.",
  },
  {
    name: "Counter drums",
    where: "Number Ticker",
    numbers: "Each drum turns on its own spring (k 150 · c 21) and clicks for every figure that passes. Counting up, drums carry forward through 9 to 0, 45 ms apart from the right.",
  },
];

/** What every study meets before it goes on the player. */
const studyBar: { title: string; body: ReactNode }[] = [
  {
    title: "Moves in its first four seconds",
    body: "Untouched: a rehearsal, a recall, a ghost typing, automation playing back, a self-test. Never still for more than half a second at the start. Then the hand takes over.",
  },
  {
    title: "Fits 282 × 332",
    body: (
      <>
        A root <code className={code}>@container w-full max-w-[…]</code>, a <code className={code}>cqw</code>-clamped font size on its child,
        everything else in em. Size to the container, never the viewport. Touch targets 24px or more.
      </>
    ),
  },
  {
    title: "Built from the materials, and marks them",
    body: (
      <>
        A plate of the body&apos;s finish with wells, keys, caps, an LCD and lights. Never a second player, never a flat{" "}
        <code className={code}>shadow-md</code> card. Both themes look intentional. Each part carries <code className={code}>data-part</code>, so its
        page can take it apart.
      </>
    ),
  },
  {
    title: "Sounds through play()",
    body: "Existing sounds only, varied with pitch and gain. What it plays by itself follows the transport rule; what the viewer does always sounds.",
  },
  {
    title: "Turns without transforms",
    body: (
      <>
        Rotation is <code className={code}>conic-gradient(from var(--a))</code> or SVG attributes, or a transform inside an{" "}
        <code className={code}>overflow-hidden</code> wrapper, so a turning part never spills its stage.
      </>
    ),
  },
  {
    title: "Rounds its trigonometry",
    body: "Coordinates rendered on the server are rounded to two decimals, so the browser's Math agrees when it hydrates.",
  },
  {
    title: "Passes the React Compiler rules",
    body: (
      <>
        No <code className={code}>ref.current</code> during render, no synchronous <code className={code}>setState</code> in an effect body, no{" "}
        <code className={code}>Math.random</code> or <code className={code}>performance.now</code> in component-scope helpers.{" "}
        <code className={code}>useEffectEvent</code> for what effects call.
      </>
    ),
  },
  {
    title: "Accessible from the start",
    body: "Native roles, one tab stop per composite, focus that follows the hand (no ring on pointerdown), live regions for changes, and reduced motion respected.",
  },
  {
    title: "Draws without React",
    body: (
      <>
        Per-frame work writes CSS variables and attributes, and springs come from <code className={code}>createSpring</code>. React hears about
        commits, not frames.
      </>
    ),
  },
  {
    title: "One file",
    body: (
      <>
        A real, controlled component and a default <code className={code}>Demo</code> with a single root, importing react,{" "}
        <code className={code}>@/lib/sound</code> and <code className={code}>@/design-system</code> only. It never takes focus on mount.
      </>
    ),
  },
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

/** A theme's colours as CSS variables, so a light card stays light on a dark page. */
const themeVars = (theme: "light" | "dark") => Object.fromEntries(Object.entries(colors[theme]).map(([token, value]) => [`--${token}`, value])) as CSSProperties;

function Swatches({ theme }: { theme: "light" | "dark" }) {
  const values = colors[theme];
  return (
    <div data-theme={theme} style={themeVars(theme)} className="rounded-xl bg-canvas p-2 text-ink shadow-[inset_0_0_0_1px_var(--line)]">
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


/** The plate every study starts from. */
const plateRecipe = `<div className="@container w-full max-w-[360px]">
  <div className="relative isolate overflow-hidden rounded-[1.25em] p-[0.9em]
    text-[clamp(11px,4cqw,14px)] [background:var(--device-body)]
    shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)]">
    <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />
    <div className="rounded-[1.05em] bg-(--device-well) p-[0.45em] shadow-(--device-recess)">…</div>
  </div>
</div>`;

export default function SystemPage() {
  return (
    <Container>
      <header className="max-w-[560px] pb-16 pt-12 sm:pt-24">
        <h1 className="text-body">
          <span className="font-medium text-ink">System</span>
          <span className="text-muted"> · v2.0</span>
        </h1>
        <p className="mt-3 text-lead text-ink">
          The rules behind litt.design, this gallery and the player that runs it. Tokens live in{" "}
          <code className={code}>src/design-system/tokens.css</code>, primitives in{" "}
          <code className={code}>src/design-system/primitives</code>, the reasoning in <code className={code}>DESIGN.md</code>.
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

        <Section id="color" title="Colour" intro="Neutral grounds, three text greys, one accent. Every value is a token with a light and dark definition.">
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
          <div className="mt-10">
            <p className="text-body font-medium text-ink">Signals</p>
            <p className="mb-4 mt-1 max-w-[560px] text-body text-muted">
              Colour is never decoration. Each of these means one thing, and a light that glows is a signal; a lit segment is not.
            </p>
            <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {signals.map((s) => (
                <li key={s.token} className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 size-6 shrink-0 rounded-sm shadow-[inset_0_0_0_1px_var(--line-strong)]"
                    style={{ background: `var(${s.token})` }}
                  />
                  <div className="min-w-0">
                    <p className="font-mono text-meta text-ink">{s.token}</p>
                    <p className="text-meta text-muted">{s.use}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section id="type" title="Type" intro="Geist Sans for everything, Geist Mono for code and figures on the page. Small sizes, tight tracking, weight 400 and 500 on the page; the hardware adds light figures and semibold lettering.">
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
          <ul className="mt-6 flex flex-col gap-1.5 text-body text-muted">
            <li>
              Figures that change are tabular (<code className={code}>tabular-nums</code>), on the screen and on the hardware, so a count never
              shuffles sideways.
            </li>
            <li>
              The hardware has its own lettering, sized in em from its plate: engraved captions at 0.6em, semibold, capitals tracked 0.16em; key
              lettering at 0.8em, medium, tracked 0.03em; LCD figures in light (300) at −0.03em. See Materials.
            </li>
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
          <p className="mt-6 max-w-[640px] text-body text-muted">
            On the hardware, radii are in em and nest: a plate at 1.25em, a well at 1.05em, a key or an LCD at 0.7em, the chip at 0.4em. Elevation
            is light, not drop: a lit top edge, a recess for anything pressed in, a 2px base under every key.
          </p>
        </Section>

        <Section id="materials" title="Materials" intro="The player's hardware, rendered from its tokens. Studies are built from these parts, so each reads as part of the same instrument.">
          <MaterialsPlate />
          <dl className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {materials.map((m) => (
              <div key={m.name}>
                <dt className="text-body font-medium text-ink">{m.name}</dt>
                <dd className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-meta text-ink">
                  {m.tokens.map((t) => (
                    <span key={t} className="whitespace-nowrap">
                      {deviceVar(t)}
                    </span>
                  ))}
                </dd>
                <dd className="mt-1 text-body text-muted">{m.use}</dd>
              </div>
            ))}
          </dl>
          <ul className="mt-8 flex flex-col gap-1.5 text-body text-muted">
            <li>
              Plate, then well, then part: wells are pressed into the plate; keys, LCDs and collars sit in wells; caps sit in collars. Grain goes on
              the plate only, as <code className={code}>.device-grain</code> at <code className={code}>--device-grain</code> (0.3).
            </li>
            <li>
              Size it all in em from one font size on the plate, so the object scales as one piece. Keys sink 2px onto their base in 75ms and come
              back at <code className={code}>--duration-exit</code>.
            </li>
            <li>
              The LCD carries a white chip with a glyph for its state (a red dot that pulses for play), light figures and dim units. Signal lights
              glow with a shadow in their own colour; unlit ones are <code className={code}>--device-meter-off</code>.
            </li>
          </ul>
          <pre className="mt-6 overflow-x-auto rounded-xl bg-panel p-4 font-mono text-[12px] leading-[1.6] text-ink shadow-[inset_0_0_0_1px_var(--line)]">
            <code>{plateRecipe}</code>
          </pre>
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
          <div className="mt-10">
            <p className="text-body font-medium text-ink">Physics</p>
            <p className="mb-4 mt-1 max-w-[560px] text-body text-muted">
              Where a study stands in for a mechanism, it models the mechanism: a small integrator or a spring with real numbers, not a duration and
              a curve.
            </p>
            <ul className="flex flex-col divide-y divide-line rounded-xl bg-panel px-4 shadow-[inset_0_0_0_1px_var(--line)] sm:px-5">
              {mechanisms.map((m) => (
                <li key={m.name} className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-4">
                  <div>
                    <p className="text-body font-medium text-ink">{m.name}</p>
                    <p className="text-meta text-muted">{m.where}</p>
                  </div>
                  <p className="text-body text-muted">{m.numbers}</p>
                </li>
              ))}
            </ul>
          </div>
          <ul className="mt-6 flex flex-col gap-1.5 text-body text-muted">
            <li>
              Stagger siblings that enter together by <code className={code}>--stagger</code> (50ms), capped at 8, so a
              long list never waits on its last item. Motors that move one after another wait longer: 120ms between a desk&apos;s knobs.
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
            <li>
              Press feedback: hardware keys sink 2px in 75ms; flat controls take <code className={code}>active:scale-[0.97]</code>.
            </li>
            <li>Hover in at enter speed, out at exit speed, so the UI never lags behind the pointer.</li>
            <li>Never animate from <code className={code}>scale(0)</code>. Start at 0.95 or more with opacity.</li>
            <li>Respect reduced motion: transitions collapse to instant, motors jump, rehearsals don&apos;t start, autoplay media shows a still.</li>
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

        <Section id="sound" title="Sound" intro="Clicks after the 2009 click wheel, a little warmer. Synthesized with Web Audio; nothing loads.">
          <SoundDemo />
          <ul className="mt-6 flex flex-col gap-1.5 text-body text-muted">
            <li>
              Fire and forget: <code className={code}>play(&quot;select&quot;)</code> from{" "}
              <code className={code}>@/lib/sound</code>. It never throws, and stays silent until the first press or key.
            </li>
            <li>
              Keys sound by themselves: <code className={code}>Button</code> and{" "}
              <code className={code}>ButtonLink</code> press and release, ghost buttons tick. Opt out with{" "}
              <code className={code}>data-sound=&quot;off&quot;</code>.
            </li>
            <li>
              Quiet and dry: one bus at a conservative level (peaks near -18 dBFS), a faint room and a compressor; 2.5 dB lower on touch screens;
              never more than eight voices at once. Volume moves the bus in 2 dB steps around 7, the level every sound was tuned at.
            </li>
            <li>
              In time: sequencers pass <code className={code}>{"{ delay }"}</code> to schedule a note up to 0.5 s ahead on the audio clock. The rate
              limit counts when a sound will be heard, and scheduled notes never take the last two voices, so a key press always clicks.
            </li>
            <li>
              <code className={code}>slate</code> is the recorder&apos;s line-up tone: 1 kHz held for most of a second, which a VU meter reads as 0.
              <code className={code}> readLevels()</code> returns what leaves the bus, for meters.
            </li>
            <li>Vary a repeated sound with pitch and gain (a detent at 0.97 to 1.03), never with new sounds. Mute is remembered per device and follows across tabs.</li>
          </ul>
          <div className="mt-10">
            <p className="text-body font-medium text-ink">The transport rule</p>
            <p className="mb-4 mt-1 max-w-[560px] text-body text-muted">
              On the player, the running study carries the tape&apos;s transport as <code className={code}>data-transport</code>;{" "}
              <code className={code}>hostTransport(el)</code> reads it. Sounds a study makes by itself ask first. Sounds from the viewer&apos;s own
              input always play.
            </p>
            <ul className="grid gap-px overflow-hidden rounded-xl bg-line shadow-[inset_0_0_0_1px_var(--line)] sm:grid-cols-2">
              {[
                ["play", "Aloud."],
                ["pause", "Runs, but quiet until the viewer works it (a pointerdown or keydown on the study)."],
                ["stop", "Stays put. STOP remounts the study at its first frame; it doesn't start by itself."],
                ["no host", "Component pages and capture frames read play."],
              ].map(([state, rule]) => (
                <li key={state} className="flex gap-3 bg-panel px-4 py-3 text-body">
                  <span className="w-16 shrink-0 font-mono text-meta leading-[1.6] text-ink">{state}</span>
                  <span className="text-muted">{rule}</span>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section id="studies" title="Studies" intro="The bar a study meets before it goes on the player. It gets a few seconds, untouched, and a phone a small screen.">
          <StudyBoxes />
          <ol className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {studyBar.map((s, i) => (
              <li key={s.title}>
                <p className="text-body font-medium text-ink">
                  <span className="mr-2 tabular-nums text-subtle">{i + 1}</span>
                  {s.title}
                </p>
                <p className="mt-1 text-body text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-8 max-w-[640px] text-body text-muted">
            Run <code className={code}>npm run check:fit</code> before pushing: it loads every component page, the player&apos;s screen and the
            capture frame at six widths and fails if anything spills its stage. <code className={code}>npm run check:anatomy</code> takes every
            study apart on its page and fails if anything flattens the 3D or spills.
          </p>
        </Section>

        <Section id="writing" title="Writing" intro="Plain, precise, British-spelled and quiet.">
          <ul className="grid gap-x-8 gap-y-3 text-body sm:grid-cols-2">
            {[
              ["Sentence case everywhere", "“Selected work”, not “SELECTED WORK” or “Selected Work”."],
              ["Labels say what happens", "“Copy command”, then “Copied”. Not “Submit” or “OK”."],
              ["Short and plain", "Write it the way you'd say it to someone at the next desk."],
              ["Parentheses for status", "“Carson (In progress)”. A blue dot comes with it."],
              ["British spelling, with -ize", "“Colour”, “centre”, “dialled”; but “synthesized”, “motorized”. Oxford spelling."],
              ["Say it once", "If the screen already says it, the LCD doesn't. Repeats are taken out, not restyled."],
              ["Units and real symbols", "“−3.5 dB”, “48 kHz · 24 bit”, “282 × 332”: a true minus, a times sign, a middle dot."],
              ["Capitals belong to the hardware", "Lettering on the body is set in capitals by CSS. The source and screen readers keep sentence case: “Hold to erase”."],
              ["The recorder's world, in demos", "take_04.wav, Export, Slate, Scene A. The component stays general; its demo speaks the instrument's language."],
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

/** The smallest stage a study gets, inside the capture frame, to scale. */
function StudyBoxes() {
  return (
    <figure className="flex flex-col gap-3">
      <div className="relative aspect-[702/374] w-full max-w-[702px] rounded-xl bg-panel shadow-[inset_0_0_0_1px_var(--line-strong)]">
        <div className="absolute left-3 top-2.5 sm:left-4 sm:top-3.5">
          <p className="font-mono text-meta text-ink">702 × 374</p>
          <p className="text-meta text-muted">Capture frame</p>
        </div>
        <div
          className="absolute rounded-lg bg-canvas shadow-[0_0_0_1px_var(--line-strong)]"
          style={{ width: `${(282 / 702) * 100}%`, height: `${(332 / 374) * 100}%`, right: `${(21 / 702) * 100}%`, top: `${(21 / 374) * 100}%` }}
        >
          <div className="absolute inset-x-0 bottom-2.5 text-center sm:bottom-3.5">
            <p className="font-mono text-meta text-ink">282 × 332</p>
            <p className="text-meta text-muted">Smallest stage</p>
          </div>
        </div>
      </div>
      <figcaption className="max-w-[702px] text-meta text-muted">
        To scale: the smallest stage a study gets (the player&apos;s floor zoom on a phone, less the stage&apos;s padding) beside the capture frame it is filmed in.
      </figcaption>
    </figure>
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
