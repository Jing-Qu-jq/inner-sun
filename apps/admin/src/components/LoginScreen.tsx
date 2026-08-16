import { useState, type FormEvent } from "react";
import { Alert, Button, Card, Container, Form, Spinner } from "react-bootstrap";
import { ApiError, login, type AdminIdentity } from "../api";

export default function LoginScreen({ onSignedIn }: { onSignedIn: (who: AdminIdentity) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await login(email, password));
    } catch (err) {
      // The server returns one message for every failure so it cannot be used to
      // discover which email addresses have accounts; just show what it said.
      setError(
        err instanceof ApiError && err.code === "rate_limited"
          ? "Too many attempts. Please wait a few minutes and try again."
          : err instanceof Error
            ? err.message
            : "Sign-in failed.",
      );
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
          <Card.Title as="h1" className="h4 mb-4">
            Care Pattern admin
          </Card.Title>

          {error && <Alert variant="danger">{error}</Alert>}

          <Form onSubmit={submit}>
            <Form.Group className="mb-3" controlId="email">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Form.Group>

            <Form.Group className="mb-4" controlId="password">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Form.Group>

            <Button type="submit" variant="primary" className="w-100" disabled={busy}>
              {busy && <Spinner animation="border" size="sm" className="me-2" />}
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </Form>

          <p className="text-secondary small mt-3 mb-0">
            Accounts are created by an engineer with <code>npm run admin:create</code>. There is no
            self-service sign-up.
          </p>
        </Card.Body>
      </Card>
    </Container>
  );
}
