import { forwardRef, useId, type MouseEventHandler, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';

export function Brand({ href, onClick }: { href: string; onClick?: MouseEventHandler<HTMLAnchorElement> }) {
  return <a className="brand" href={href} onClick={onClick} aria-label="GetYourFit home"><span className="brand-mark" aria-hidden="true">g.</span>GetYourFit</a>;
}

type FieldControl = { id: string; 'aria-describedby'?: string };

export function Field({ label, hint, hintId, optional, children }: { label: ReactNode; hint?: ReactNode; hintId?: string; optional?: boolean; children: (control: FieldControl) => ReactNode }) {
  const id = useId();
  const describedBy = hint ? hintId ?? `${id}-hint` : undefined;
  return <div className="field">
    <label className="field-label" htmlFor={id}>{label}{optional && <span className="field-optional"> (optional)</span>}</label>
    {children({ id, 'aria-describedby': describedBy })}
    {hint && <p className="field-hint" id={describedBy}>{hint}</p>}
  </div>;
}

type Tone = 'info' | 'success' | 'warning' | 'error';
const icons = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleAlert } satisfies Record<Tone, unknown>;

export const Notice = forwardRef<HTMLDivElement, { tone: Tone; title?: ReactNode; children?: ReactNode; role?: 'alert' | 'status'; focusable?: boolean; id?: string }>(
  function Notice({ tone, title, children, role, focusable, id }, ref) {
    const Icon = icons[tone];
    return <div ref={ref} id={id} className={`notice notice-${tone}`} role={role} tabIndex={focusable ? -1 : undefined}>
      <Icon size={20} aria-hidden="true" />
      <div className="notice-body">{title && <p className="notice-title">{title}</p>}{children}</div>
    </div>;
  },
);
