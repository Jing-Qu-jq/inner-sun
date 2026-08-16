import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Form, ListGroup, Row, Spinner } from "react-bootstrap";
import {
  createCarePattern,
  listCarePatterns,
  publishCarePattern,
  retireCarePattern,
  updateCarePattern,
  type CarePattern,
  type CarePatternDraft,
  type EmbeddingStatus,
} from "../api";
import ConfirmDialog from "./ConfirmDialog";
import ListField from "./ListField";
import RevisionHistory from "./RevisionHistory";

const EMPTY: CarePatternDraft = {
  title: "",
  situation: "",
  signals: [],
  strategies: [],
  avoid: [],
  escalation: "",
  sourceRefs: [],
  localeNotes: {},
};

function toDraft(pattern: CarePattern): CarePatternDraft {
  return {
    title: pattern.title,
    situation: pattern.situation,
    signals: pattern.signals,
    strategies: pattern.strategies,
    avoid: pattern.avoid,
    escalation: pattern.escalation,
    sourceRefs: pattern.sourceRefs,
    localeNotes: pattern.localeNotes,
  };
}

/** Blank rows are an artifact of the always-one-empty-input editor, not content. */
function clean(draft: CarePatternDraft): CarePatternDraft {
  const trimList = (items: string[]) => items.map((i) => i.trim()).filter(Boolean);
  const localeNotes = Object.fromEntries(
    Object.entries(draft.localeNotes).filter(([, v]) => v.trim() !== ""),
  );
  return {
    title: draft.title.trim(),
    situation: draft.situation.trim(),
    signals: trimList(draft.signals),
    strategies: trimList(draft.strategies),
    avoid: trimList(draft.avoid),
    escalation: draft.escalation.trim(),
    sourceRefs: trimList(draft.sourceRefs),
    localeNotes,
  };
}

/**
 * These describe indexing only, never whether the pattern is live — a draft can be fully
 * indexed and still reach nobody. The draft/retired banner owns that half of the story, so
 * saying "now searchable" here would contradict it.
 */
const SAVE_NOTICE: Record<EmbeddingStatus, { variant: "success" | "warning"; text: string }> = {
  embedded: { variant: "success", text: "Saved and indexed." },
  unchanged: {
    variant: "success",
    text: "Saved. The situation text didn't change, so it kept its existing index.",
  },
  failed: {
    variant: "warning",
    text:
      "Saved, but NOT indexed. The indexing service couldn't be reached, so this pattern " +
      "can't be matched to a student and can't be published yet. Your writing is safe — " +
      "press Save again to retry.",
  },
};

type Notice = { variant: "success" | "warning" | "info"; text: string };

export default function CarePatternsTab() {
  const [patterns, setPatterns] = useState<CarePattern[]>([]);
  const [includeRetired, setIncludeRetired] = useState(false);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<CarePatternDraft>(EMPTY);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmRetire, setConfirmRetire] = useState<CarePattern | null>(null);

  const selected = useMemo(
    () => (selectedId && selectedId !== "new" ? (patterns.find((p) => p.id === selectedId) ?? null) : null),
    [patterns, selectedId],
  );

  async function refresh() {
    setLoading(true);
    try {
      const { patterns: next } = await listCarePatterns(includeRetired);
      setPatterns(next);
    } catch (err) {
      setNotice({ variant: "warning", text: err instanceof Error ? err.message : "Could not load patterns." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeRetired]);

  function select(pattern: CarePattern) {
    setSelectedId(pattern.id);
    setDraft(toDraft(pattern));
    setNotice(null);
  }

  function startNew() {
    setSelectedId("new");
    setDraft(EMPTY);
    setNotice(null);
  }

  async function save() {
    const payload = clean(draft);
    if (!payload.title || !payload.situation) {
      setNotice({ variant: "warning", text: "A pattern needs both a title and a situation." });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const result =
        selectedId === "new" ? await createCarePattern(payload) : await updateCarePattern(selectedId!, payload);

      setNotice(SAVE_NOTICE[result.embeddingStatus]);
      setSelectedId(result.pattern.id);
      setDraft(toDraft(result.pattern));
      await refresh();
    } catch (err) {
      setNotice({ variant: "warning", text: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  async function publish(pattern: CarePattern) {
    setBusy(true);
    setNotice(null);
    try {
      await publishCarePattern(pattern.id);
      setNotice({ variant: "success", text: "Published. Students can now be matched to this pattern." });
      await refresh();
    } catch (err) {
      setNotice({ variant: "warning", text: err instanceof Error ? err.message : "Could not publish." });
    } finally {
      setBusy(false);
    }
  }

  async function retire(pattern: CarePattern) {
    setBusy(true);
    setNotice(null);
    try {
      await retireCarePattern(pattern.id);
      setNotice({
        variant: "info",
        text: "Retired. It stays on record and in the history, but is no longer matched to students.",
      });
      setConfirmRetire(null);
      await refresh();
    } catch (err) {
      setNotice({ variant: "warning", text: err instanceof Error ? err.message : "Could not retire." });
      setConfirmRetire(null);
    } finally {
      setBusy(false);
    }
  }

  const editing = selectedId !== null;

  return (
    <>
      <Row className="g-4">
        <Col lg={4} xl={3}>
          <Card>
            <Card.Header className="d-flex align-items-center justify-content-between">
              <span className="fw-semibold">Care Patterns</span>
              <Button size="sm" variant="primary" onClick={startNew}>
                New
              </Button>
            </Card.Header>

            <Card.Body className="py-2">
              <Form.Check
                type="checkbox"
                id="show-retired"
                label="Show retired"
                className="small text-secondary"
                checked={includeRetired}
                onChange={(e) => setIncludeRetired(e.target.checked)}
              />
            </Card.Body>

            {loading ? (
              <Card.Body className="text-center text-secondary py-4">
                <Spinner animation="border" size="sm" className="me-2" />
                Loading…
              </Card.Body>
            ) : patterns.length === 0 ? (
              <Card.Body className="text-center text-secondary py-4">
                No patterns yet. Press New to write the first one.
              </Card.Body>
            ) : (
              <ListGroup variant="flush" className="pattern-list">
                {patterns.map((p) => (
                  <ListGroup.Item
                    key={p.id}
                    action
                    active={selectedId === p.id}
                    onClick={() => select(p)}
                    className="py-2"
                  >
                    <div className="fw-semibold small">{p.title}</div>
                    <div className="d-flex flex-wrap align-items-center gap-1 mt-1">
                      {p.status === "draft" && <Badge bg="warning" text="dark">draft</Badge>}
                      {p.status === "retired" && <Badge bg="secondary">retired</Badge>}
                      {p.needsEmbedding && <Badge bg="danger">not indexed</Badge>}
                      <span className="small text-secondary">
                        edited {new Date(p.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            )}
          </Card>
        </Col>

        <Col lg={8} xl={9}>
          <Card>
            {!editing ? (
              <Card.Body className="text-center text-secondary py-5">
                Select a pattern on the left, or press New.
              </Card.Body>
            ) : (
              <>
                <Card.Header className="fw-semibold">
                  {selectedId === "new" ? "New Care Pattern" : selected?.title}
                </Card.Header>

                <Card.Body>
                  {/* Standing context, not a transient message: whether this pattern is live
                      is the thing most worth knowing while editing it, so it stays on screen. */}
                  {(selectedId === "new" || selected?.status === "draft") && (
                    <Alert variant="secondary">
                      <strong>Draft.</strong> Nothing here reaches students until you press Publish,
                      so it is safe to save half-finished work and come back to it.
                    </Alert>
                  )}
                  {selected?.status === "retired" && (
                    <Alert variant="secondary">
                      <strong>Retired.</strong> Kept on record and in the history, but not matched to
                      students. Publish again to bring it back.
                    </Alert>
                  )}

                  {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}

                  {selected?.needsEmbedding && !notice && (
                    <Alert variant="danger">
                      This pattern has no current index, so it cannot be matched to a student and
                      cannot be published. Press Save to index it.
                    </Alert>
                  )}

                  <Form.Group className="mb-3" controlId="title">
                    <Form.Label className="fw-semibold">Title</Form.Label>
                    <Form.Text className="d-block mb-2">
                      How you and your colleagues refer to this pattern.
                    </Form.Text>
                    <Form.Control
                      type="text"
                      value={draft.title}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    />
                  </Form.Group>

                  <Form.Group className="mb-3" controlId="situation">
                    <Form.Label className="fw-semibold">Situation</Form.Label>
                    <Form.Text className="d-block mb-2">
                      The one field used for matching. Describe what the student is going through, in
                      the words they might use. Everything else below is what happens <em>after</em> a
                      match — changing them costs nothing, changing this re-indexes the pattern.
                    </Form.Text>
                    <Form.Control
                      as="textarea"
                      rows={5}
                      className="prose-field"
                      value={draft.situation}
                      onChange={(e) => setDraft({ ...draft, situation: e.target.value })}
                    />
                  </Form.Group>

                  <ListField
                    label="Signals"
                    hint="Observable cues that this situation is in play."
                    values={draft.signals}
                    placeholder="e.g. mentions a specific deadline"
                    onChange={(signals) => setDraft({ ...draft, signals })}
                  />

                  <ListField
                    label="Strategies"
                    hint="What the counselor guidance says to do. This is what shapes the AI's reply."
                    values={draft.strategies}
                    placeholder="e.g. Validate that this is a normal reaction."
                    onChange={(strategies) => setDraft({ ...draft, strategies })}
                  />

                  <ListField
                    label="Avoid"
                    hint="What the AI must not do here. Guardrails a general chatbot would miss."
                    values={draft.avoid}
                    placeholder="e.g. giving legal advice"
                    onChange={(avoid) => setDraft({ ...draft, avoid })}
                  />

                  <Form.Group className="mb-3" controlId="escalation">
                    <Form.Label className="fw-semibold">Escalation</Form.Label>
                    <Form.Text className="d-block mb-2">
                      When this should become a referral to a human counselor.
                    </Form.Text>
                    <Form.Control
                      as="textarea"
                      rows={2}
                      className="prose-field"
                      value={draft.escalation}
                      onChange={(e) => setDraft({ ...draft, escalation: e.target.value })}
                    />
                  </Form.Group>

                  <ListField
                    label="Source references"
                    hint="Citations backing this guidance — the clinical traceability behind the reply."
                    values={draft.sourceRefs}
                    placeholder="e.g. Author (2021), Journal of…"
                    onChange={(sourceRefs) => setDraft({ ...draft, sourceRefs })}
                  />

                  <Form.Group className="mb-3" controlId="locale-zh">
                    <Form.Label className="fw-semibold">Cultural note (中文)</Form.Label>
                    <Form.Text className="d-block mb-2">
                      Patterns are written in English because matching happens in English. This is the
                      one place for nuance that doesn't survive translation.
                    </Form.Text>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      className="prose-field"
                      value={draft.localeNotes["zh-CN"] ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, localeNotes: { ...draft.localeNotes, "zh-CN": e.target.value } })
                      }
                    />
                  </Form.Group>

                  <div className="d-flex flex-wrap align-items-center gap-2 pt-2 border-top">
                    <Button variant="primary" onClick={save} disabled={busy}>
                      {busy && <Spinner animation="border" size="sm" className="me-2" />}
                      {busy ? "Saving…" : "Save"}
                    </Button>

                    {selected && selected.status !== "published" && (
                      <Button variant="outline-primary" onClick={() => publish(selected)} disabled={busy}>
                        {selected.status === "draft" ? "Publish" : "Publish again"}
                      </Button>
                    )}
                    {selected && selected.status === "published" && (
                      <Button variant="outline-danger" onClick={() => setConfirmRetire(selected)} disabled={busy}>
                        Retire
                      </Button>
                    )}

                    {selected && (
                      <span className="text-secondary small ms-auto">
                        {selected.embeddedAt
                          ? `Indexed ${new Date(selected.embeddedAt).toLocaleString()}`
                          : "Never indexed"}
                      </span>
                    )}
                  </div>

                  {selected && (
                    <div className="mt-4">
                      <h6 className="fw-semibold">History</h6>
                      <RevisionHistory patternId={selected.id} refreshToken={selected.updatedAt} />
                    </div>
                  )}
                </Card.Body>
              </>
            )}
          </Card>
        </Col>
      </Row>

      <ConfirmDialog
        show={confirmRetire !== null}
        title="Retire this Care Pattern?"
        body={
          <>
            <p>
              <strong>{confirmRetire?.title}</strong> will stop being matched to students
              immediately.
            </p>
            <p className="mb-0 text-secondary">
              Nothing is deleted — it keeps its full history and you can publish it again at any
              time.
            </p>
          </>
        }
        confirmLabel="Retire"
        busy={busy}
        onConfirm={() => confirmRetire && retire(confirmRetire)}
        onCancel={() => setConfirmRetire(null)}
      />
    </>
  );
}
