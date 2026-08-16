import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Form, ListGroup, Row, Spinner } from "react-bootstrap";
import {
  createCannedResponse,
  listCannedResponses,
  restoreCannedResponse,
  retireCannedResponse,
  updateCannedResponse,
  type CannedResponse,
  type CannedResponseDraft,
} from "../api";
import ConfirmDialog from "./ConfirmDialog";

const EMPTY: CannedResponseDraft = { key: "", question: {}, answer: {} };

function toDraft(item: CannedResponse): CannedResponseDraft {
  return { key: item.key, question: item.question, answer: item.answer };
}

type Notice = { variant: "success" | "warning" | "info"; text: string };

export default function FaqTab() {
  const [items, setItems] = useState<CannedResponse[]>([]);
  const [includeRetired, setIncludeRetired] = useState(false);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<CannedResponseDraft>(EMPTY);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmRetire, setConfirmRetire] = useState<CannedResponse | null>(null);

  const selected = useMemo(
    () => (selectedId && selectedId !== "new" ? (items.find((i) => i.id === selectedId) ?? null) : null),
    [items, selectedId],
  );

  async function refresh() {
    setLoading(true);
    try {
      const { cannedResponses } = await listCannedResponses(includeRetired);
      setItems(cannedResponses);
    } catch (err) {
      setNotice({ variant: "warning", text: err instanceof Error ? err.message : "Could not load answers." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeRetired]);

  async function save() {
    const payload: CannedResponseDraft = {
      key: draft.key.trim(),
      question: draft.question,
      answer: draft.answer,
    };
    if (!payload.key) {
      setNotice({ variant: "warning", text: "An answer needs a key." });
      return;
    }
    if (!payload.answer.en?.trim()) {
      setNotice({ variant: "warning", text: "The English answer can't be empty." });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const result =
        selectedId === "new" ? await createCannedResponse(payload) : await updateCannedResponse(selectedId!, payload);
      setSelectedId(result.cannedResponse.id);
      setDraft(toDraft(result.cannedResponse));
      setNotice({ variant: "success", text: "Saved." });
      await refresh();
    } catch (err) {
      setNotice({ variant: "warning", text: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  // Only retiring asks. Restoring is the safe direction — it puts an answer back rather
  // than taking one away — and confirming every state change trains people to dismiss the
  // dialog without reading it, which is worse than not having one.
  async function retire(item: CannedResponse) {
    setBusy(true);
    try {
      await retireCannedResponse(item.id);
      setConfirmRetire(null);
      await refresh();
      setNotice({ variant: "info", text: "Retired. Students will no longer be offered this answer." });
    } catch (err) {
      setNotice({ variant: "warning", text: err instanceof Error ? err.message : "Could not retire." });
      setConfirmRetire(null);
    } finally {
      setBusy(false);
    }
  }

  async function restore(item: CannedResponse) {
    setBusy(true);
    try {
      await restoreCannedResponse(item.id);
      await refresh();
      setNotice({ variant: "info", text: "Restored." });
    } catch (err) {
      setNotice({ variant: "warning", text: err instanceof Error ? err.message : "Could not restore." });
    } finally {
      setBusy(false);
    }
  }

  const setText = (half: "question" | "answer", locale: string, value: string) =>
    setDraft({ ...draft, [half]: { ...draft[half], [locale]: value } });

  return (
    <>
      <Row className="g-4">
      <Col lg={4} xl={3}>
        <Card>
          <Card.Header className="d-flex align-items-center justify-content-between">
            <span className="fw-semibold">FAQ answers</span>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setSelectedId("new");
                setDraft(EMPTY);
                setNotice(null);
              }}
            >
              New
            </Button>
          </Card.Header>

          <Card.Body className="py-2">
            <Form.Check
              type="checkbox"
              id="faq-show-retired"
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
          ) : items.length === 0 ? (
            <Card.Body className="text-center text-secondary py-4">No answers yet.</Card.Body>
          ) : (
            <ListGroup variant="flush" className="pattern-list">
              {items.map((item) => (
                <ListGroup.Item
                  key={item.id}
                  action
                  active={selectedId === item.id}
                  onClick={() => {
                    setSelectedId(item.id);
                    setDraft(toDraft(item));
                    setNotice(null);
                  }}
                  className="py-2"
                >
                  <div className="fw-semibold small">{item.question.en || item.key}</div>
                  <div className="d-flex flex-wrap align-items-center gap-1 mt-1">
                    {!item.isActive && <Badge bg="secondary">retired</Badge>}
                    <code className="small text-secondary">{item.key}</code>
                  </div>
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}
        </Card>
      </Col>

      <Col lg={8} xl={9}>
        <Card>
          {selectedId === null ? (
            <Card.Body className="text-center text-secondary py-5">
              Select an answer on the left, or press New.
            </Card.Body>
          ) : (
            <>
              <Card.Header className="fw-semibold">
                {selectedId === "new" ? "New FAQ answer" : selected?.key}
              </Card.Header>

              <Card.Body>
                {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}

                <Alert variant="secondary">
                  These are returned to students word for word, with no AI involved and no cost. Use
                  them for questions with one correct answer.
                </Alert>

                <Form.Group className="mb-3" controlId="faq-key">
                  <Form.Label className="fw-semibold">Key</Form.Label>
                  <Form.Text className="d-block mb-2">
                    A stable identifier the chat interface refers to — lowercase letters, numbers and
                    underscores. Changing it on an answer already in use will break that reference.
                  </Form.Text>
                  <Form.Control
                    type="text"
                    value={draft.key}
                    placeholder="is_confidential"
                    onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                  />
                </Form.Group>

                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3" controlId="q-en">
                      <Form.Label className="fw-semibold">Question — English</Form.Label>
                      <Form.Text className="d-block mb-2">The label on the quick-reply chip.</Form.Text>
                      <Form.Control
                        type="text"
                        value={draft.question.en ?? ""}
                        onChange={(e) => setText("question", "en", e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3" controlId="q-zh">
                      <Form.Label className="fw-semibold">Question — 中文</Form.Label>
                      <Form.Text className="d-block mb-2">&nbsp;</Form.Text>
                      <Form.Control
                        type="text"
                        value={draft.question["zh-CN"] ?? ""}
                        onChange={(e) => setText("question", "zh-CN", e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3" controlId="a-en">
                      <Form.Label className="fw-semibold">Answer — English</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={4}
                        className="prose-field"
                        value={draft.answer.en ?? ""}
                        onChange={(e) => setText("answer", "en", e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3" controlId="a-zh">
                      <Form.Label className="fw-semibold">Answer — 中文</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={4}
                        className="prose-field"
                        value={draft.answer["zh-CN"] ?? ""}
                        onChange={(e) => setText("answer", "zh-CN", e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <div className="d-flex flex-wrap gap-2 pt-2 border-top">
                  <Button variant="primary" onClick={save} disabled={busy}>
                    {busy && <Spinner animation="border" size="sm" className="me-2" />}
                    {busy ? "Saving…" : "Save"}
                  </Button>
                  {selected && selected.isActive && (
                    <Button variant="outline-danger" onClick={() => setConfirmRetire(selected)} disabled={busy}>
                      Retire
                    </Button>
                  )}
                  {selected && !selected.isActive && (
                    <Button variant="outline-primary" onClick={() => restore(selected)} disabled={busy}>
                      Restore
                    </Button>
                  )}
                </div>
              </Card.Body>
            </>
          )}
        </Card>
      </Col>
      </Row>

      <ConfirmDialog
        show={confirmRetire !== null}
        title="Retire this FAQ answer?"
        body={
          <>
            <p>
              <strong>{confirmRetire?.question.en || confirmRetire?.key}</strong> will stop being
              offered to students immediately.
            </p>
            <p className="mb-0 text-secondary">Nothing is deleted — you can restore it at any time.</p>
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
