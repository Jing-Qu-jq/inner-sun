import { Button, Modal, Spinner } from "react-bootstrap";

interface Props {
  show: boolean;
  title: string;
  /** What will happen, in plain language — including how to undo it. */
  body: React.ReactNode;
  confirmLabel: string;
  confirmVariant?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation before a consequential action.
 *
 * Worth a component rather than `window.confirm`: this can explain what actually happens
 * and how to reverse it, which a native dialog cannot. Bootstrap's Modal also handles the
 * parts that are easy to get wrong by hand — trapping focus inside the dialog, closing on
 * Escape, and returning focus to the trigger afterwards.
 */
export default function ConfirmDialog({
  show,
  title,
  body,
  confirmLabel,
  confirmVariant = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal show={show} onHide={onCancel} centered backdrop={busy ? "static" : true}>
      <Modal.Header closeButton={!busy}>
        <Modal.Title as="h5">{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>{body}</Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant={confirmVariant} onClick={onConfirm} disabled={busy}>
          {busy && <Spinner animation="border" size="sm" className="me-2" />}
          {confirmLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
