import { useEffect, useState } from "react";
import { Button, Container, Nav, Navbar, Spinner, Tab } from "react-bootstrap";
import { logout, me, type AdminIdentity } from "./api";
import CarePatternsTab from "./components/CarePatternsTab";
import ChangePasswordScreen from "./components/ChangePasswordScreen";
import FaqTab from "./components/FaqTab";
import LoginScreen from "./components/LoginScreen";

type TabKey = "patterns" | "faq";

export default function App() {
  // undefined = still checking the cookie; null = signed out.
  const [who, setWho] = useState<AdminIdentity | null | undefined>(undefined);
  const [tab, setTab] = useState<TabKey>("patterns");

  useEffect(() => {
    // A valid session cookie means no login screen on reload. A 401 here is the normal
    // signed-out case, not an error worth showing.
    me()
      .then(setWho)
      .catch(() => setWho(null));
  }, []);

  if (who === undefined) {
    return (
      <Container className="py-5 text-center text-secondary">
        <Spinner animation="border" size="sm" className="me-2" />
        Loading…
      </Container>
    );
  }

  if (who === null) {
    return <LoginScreen onSignedIn={setWho} />;
  }

  if (who.mustChangePassword) {
    return <ChangePasswordScreen onDone={() => setWho({ ...who, mustChangePassword: false })} />;
  }

  async function signOut() {
    await logout().catch(() => {});
    setWho(null);
  }

  return (
    <>
      {/* The Navbar deliberately holds only identity and sign-out. A Nav nested inside a
          Navbar picks up the Navbar's select context rather than Tab.Container's, so its
          onSelect never fires and the tabs silently stop switching — the tabs live below
          it instead, which also puts them next to the content they control. */}
      <Navbar className="border-bottom" sticky="top" bg="body-tertiary">
        <Container fluid className="px-3 px-md-4">
          <Navbar.Brand className="d-flex align-items-center gap-2 fw-bold">
            <span className="brand-dot" aria-hidden="true" />
            InnerSun
          </Navbar.Brand>

          <div className="d-flex align-items-center gap-3 ms-auto">
            <span className="text-secondary small d-none d-sm-inline">{who.displayName}</span>
            <Button variant="outline-secondary" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </Container>
      </Navbar>

      {/* Tab.Container rather than hand-rolled tab state: it wires up role="tablist",
          aria-controls and arrow-key navigation between tabs, which the previous custom
          implementation declared in ARIA but never actually implemented. */}
      <Tab.Container activeKey={tab} onSelect={(key) => key && setTab(key as TabKey)}>
        <Container fluid className="px-3 px-md-4 py-3 pb-5" style={{ maxWidth: 1280 }}>
          <Nav variant="pills" className="mb-4 gap-1">
            <Nav.Item>
              <Nav.Link eventKey="patterns">Care Patterns</Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="faq">FAQ answers</Nav.Link>
            </Nav.Item>
          </Nav>

          <Tab.Content>
            {/* mountOnEnter so opening the tool does not also fetch the FAQ list. */}
            <Tab.Pane eventKey="patterns" mountOnEnter>
              <CarePatternsTab />
            </Tab.Pane>
            <Tab.Pane eventKey="faq" mountOnEnter>
              <FaqTab />
            </Tab.Pane>
          </Tab.Content>
        </Container>
      </Tab.Container>
    </>
  );
}
