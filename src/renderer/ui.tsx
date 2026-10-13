import { useEffect, type ReactNode } from "react";
import { hueOf } from "./util";

export function Modal(props: { title: string; onClose: () => void; wide?: boolean; children: ReactNode; footer?: ReactNode }) {
  const { onClose } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={props.wide ? "dialog wide" : "dialog"} role="dialog" aria-label={props.title}>
        <h2>{props.title}</h2>
        <div className="dialog-body">{props.children}</div>
        {props.footer && <div className="dialog-actions">{props.footer}</div>}
      </div>
    </div>
  );
}

export function PageHeader(props: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{props.title}</h1>
        {props.subtitle && <div className="page-sub">{props.subtitle}</div>}
      </div>
      {props.actions && <div className="page-actions">{props.actions}</div>}
    </div>
  );
}

export function Empty(props: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{props.icon}</div>
      <div className="empty-title">{props.title}</div>
      {props.children && <div className="empty-body">{props.children}</div>}
    </div>
  );
}

/** A picture, or the name's first letter; `color` (a class color) replaces the name-derived hue. */
export function Avatar(props: { name: string; src?: string | null; size?: number; color?: string }) {
  const size = props.size ?? 36;
  if (props.src) return <img className="avatar" src={props.src} alt="" width={size} height={size} />;
  const h = hueOf(props.name);
  const colors = props.color
    ? { background: `color-mix(in srgb, ${props.color} 18%, #141110)`, color: props.color }
    : { background: `hsl(${h} 35% 22%)`, color: `hsl(${h} 70% 75%)` };
  return (
    <div className="avatar letter" style={{ width: size, height: size, ...colors }}>
      {props.name.replace(/[^\p{L}\p{N}]/gu, "").charAt(0).toUpperCase() || "?"}
    </div>
  );
}

export function Banner(props: { kind: "error" | "warn" | "info"; children: ReactNode; onClose?: () => void }) {
  return (
    <div className={`banner ${props.kind}`} onClick={props.onClose} role={props.kind === "error" ? "alert" : undefined}>
      {props.children}
    </div>
  );
}

export function Checkbox(props: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label className={`checkbox${props.disabled ? " disabled" : ""}`}>
      <input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={(e) => props.onChange(e.target.checked)} />
      <span>{props.children}</span>
    </label>
  );
}
