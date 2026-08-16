import { useEffect, useState } from "react";
import { ListGroup, Spinner } from "react-bootstrap";
import { listRevisions, type CarePattern, type Revision } from "../api";

const ACTION_LABEL: Record<Revision["action"], string> = {
  create: "created",
  update: "edited",
  publish: "published",
  retire: "retired",
  restore: "restored",
};

/** Which authored fields differ between two snapshots — the readable part of the audit. */
function changedFields(before: CarePattern | null, after: CarePattern): string[] {
  if (!before) return [];
  const keys: (keyof CarePattern)[] = [
    "title",
    "situation",
    "signals",
    "strategies",
    "avoid",
    "escalation",
    "sourceRefs",
    "localeNotes",
  ];
  return keys.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

interface Props {
  patternId: string;
  /**
   * The pattern's `updatedAt`. Included in the effect's dependencies so the history
   * reloads after a save: keying only on `patternId` left the panel showing stale history
   * — the new revision was recorded server-side but invisible until you clicked away and
   * back, which for an audit trail reads as "my change wasn't logged".
   */
  refreshToken: string;
}

export default function RevisionHistory({ patternId, refreshToken }: Props) {
  const [revisions, setRevisions] = useState<Revision[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRevisions(null);
    listRevisions(patternId)
      .then((r) => !cancelled && setRevisions(r.revisions))
      .catch(() => !cancelled && setRevisions([]));
    return () => {
      cancelled = true;
    };
  }, [patternId, refreshToken]);

  if (revisions === null) {
    return (
      <p className="text-secondary small mb-0">
        <Spinner animation="border" size="sm" className="me-2" />
        Loading history…
      </p>
    );
  }

  if (revisions.length === 0) {
    return <p className="text-secondary small mb-0">No changes recorded yet.</p>;
  }

  return (
    <ListGroup variant="flush">
      {revisions.map((rev) => {
        const changed = changedFields(rev.before, rev.after);
        return (
          <ListGroup.Item key={rev.id} className="px-0 py-2 bg-transparent">
            <div className="small">
              <span className="fw-semibold">{rev.authorName ?? "A removed account"}</span>{" "}
              {ACTION_LABEL[rev.action]} this pattern{" "}
              <span className="text-secondary">
                on{" "}
                {new Date(rev.createdAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </div>
            {changed.length > 0 && (
              <div className="text-secondary" style={{ fontSize: ".8rem" }}>
                Changed: {changed.join(", ")}
              </div>
            )}
          </ListGroup.Item>
        );
      })}
    </ListGroup>
  );
}
