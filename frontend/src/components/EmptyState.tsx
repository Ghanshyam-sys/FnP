import type { ReactNode } from "react";

/** The centred card shown when a page has nothing to display. */
export default function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card empty-state">
      <span className="empty-icon is-hex">{icon}</span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
