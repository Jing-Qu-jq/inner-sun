import { useState, type FormEvent } from "react";
import { Alert, Button, Card, Container, Form, Spinner } from "react-bootstrap";
import { changePassword } from "../api";

/**
 * Shown when `mustChangePassword` is set — that is, on first sign-in with the temporary
 * password `admin:create` generated. The account cannot be used until it is replaced,
 * so the password an engineer once saw in a terminal never stays valid.
 */
export default function ChangePasswordScreen({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (next !== confirm) {
      setError("The two new passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password.");
      setBusy(false);
    }
  }

  return (
    <Container className="d-flex align-items-center justify-content-center min-vh-100 py-4">
      <Card style={{ maxWidth: 400, width: "100%" }} className="shadow-sm">
        <Card.Body className="p-4">
          <div className="d-flex align-items-center gap-2 fw-bold mb-3">
            <span className="brand-dot" aria-hidden="true" />
            InnerSun
          </div>
          <Card.Title as="h1" className="h4">
            Choose your password
          </Card.Title>
          <p className="text-secondary small">
            Your account was created with a temporary password. Pick your own to continue — at least
            12 characters. Every other signed-in session will be signed out.
          </p>

          {error && <Alert variant="danger">{error}</Alert>}

          <Form onSubmit={submit}>
            <Form.Group className="mb-3" controlId="current">
              <Form.Label>Temporary password</Form.Label>
              <Form.Control
                type="password"
                autoComplete="current-password"
                required
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </Form.Group>

            <Form.Group className="mb-3" controlId="next">
              <Form.Label>New password</Form.Label>
              <Form.Control
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </Form.Group>

            <Form.Group className="mb-4" controlId="confirm">
              <Form.Label>New password again</Form.Label>
              <Form.Control
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Form.Group>

            <Button type="submit" variant="primary" className="w-100" disabled={busy}>
              {busy && <Spinner animation="border" size="sm" className="me-2" />}
              {busy ? "Saving…" : "Set password"}
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
}
