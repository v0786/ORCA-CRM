import type { ReactNode } from "react";

export default function OrcaCard(props: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md shadow-sm ${props.className ?? ""}`}
    >
      {props.children}
    </div>
  );
}

