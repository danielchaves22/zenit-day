import { useId, type ReactNode } from "react";
import { ChevronRight, Folder } from "lucide-react";

export function GroupPanel({
  name,
  count,
  open,
  onToggle,
  nested = false,
  ariaLabel,
  children,
}: {
  name: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  nested?: boolean;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      className={`subject-group ${nested ? "subgroup" : ""}`}
      aria-label={ariaLabel ?? `${nested ? "Subgrupo" : "Grupo"} ${name}`}
    >
      <button
        className="group-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
      >
        <ChevronRight size={18} className={open ? "expanded" : ""} />
        {!nested && <Folder size={17} />}
        <span className="group-name">{name}</span>
        <span
          className="group-count"
          aria-label={`${count} assunto${count === 1 ? "" : "s"}`}
        >
          {count}
        </span>
      </button>
      <div id={id} hidden={!open} className="group-body">
        {children}
      </div>
    </section>
  );
}
