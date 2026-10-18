import type { SyncReport } from "../lib/fivetools.ts";

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

const short = (p: string) => p.replace(/^data\//, "");

export function SyncReportView({ report }: { report: SyncReport }) {
  const unchanged = report.files - report.changed.length - report.added.length;
  return (
    <div className="report">
      <div>
        <b>{report.entries.toLocaleString()}</b> entries from {report.files} files.
        {report.files > 0 && (
          <span className="muted">
            {" "}
            {report.added.length} new, {report.changed.length} changed, {Math.max(0, unchanged)} unchanged
            {report.removed.length ? `, ${report.removed.length} removed` : ""}.
          </span>
        )}
      </div>
      {report.changed.length > 0 && (
        <>
          <div className="small" style={{ marginTop: 6 }}>Changed:</div>
          <ul className="small">{report.changed.map((f) => <li key={f}>{short(f)}</li>)}</ul>
        </>
      )}
      {report.failed.length > 0 && (
        <>
          <div className="small error" style={{ marginTop: 6 }}>
            {report.failed.length} failed (any earlier copy was kept):
          </div>
          <ul className="small error">{report.failed.map((f) => <li key={f}>{short(f)}</li>)}</ul>
        </>
      )}
    </div>
  );
}

/** "Are you sure?" with a primary action and Cancel. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal onClose={onCancel}>
      <h2>{title}</h2>
      <div>{children}</div>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="primary danger" onClick={onConfirm} autoFocus>
          {confirmLabel}
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </Modal>
  );
}

export function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="modal" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}
