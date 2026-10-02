import type { ReactNode } from "react";
import { cn } from "../cn";

/** Muted, sentence-case section label — "Selected work" on litt.design. */
export function SectionLabel({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <h2 id={id} className={cn("text-body text-muted", className)}>
      {children}
    </h2>
  );
}

/** Page container: wide frame with a 16px+ gutter. */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1104px] px-4 sm:px-6", className)}>{children}</div>;
}
