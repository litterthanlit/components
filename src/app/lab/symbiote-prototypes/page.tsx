import type { Metadata } from "next";
import { SymbiotePrototypes } from "@/components/lab/symbiote-prototypes";

export const metadata: Metadata = {
  title: "Symbiote prototypes",
  description: "Five takes on the symbiote, to pick one.",
  robots: { index: false },
};

export default function SymbiotePrototypesPage() {
  return <SymbiotePrototypes />;
}
