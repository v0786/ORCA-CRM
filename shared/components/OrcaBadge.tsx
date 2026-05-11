import type { ReactNode } from "react";

export default function OrcaBadge(props: {
  children: ReactNode;
  tone?: "orange" | "green" | "red" | "gray";
}) {
  const tone = props.tone ?? "gray";
  const styles =
    tone === "orange"
      ? "bg-orange-500/15 border-orange-500/30 text-orange-300"
      : tone === "green"
        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
        : tone === "red"
          ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
          : "bg-white/10 border-white/15 text-white/80";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${styles}`}
    >
      {props.children}
    </span>
  );
}

