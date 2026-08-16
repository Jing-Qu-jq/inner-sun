import { Button, Form, InputGroup } from "react-bootstrap";

// A repeatable line-item input for the Postgres text[] columns.
//
// This component is most of the reason the admin tool exists. In a raw table editor these
// fields are literal array syntax — {"first item","second item"} — where a stray comma or
// apostrophe inside a sentence silently breaks the row. Here each item is its own input.

interface Props {
  label: string;
  hint?: string;
  values: string[];
  placeholder?: string;
  onChange: (values: string[]) => void;
}

export default function ListField({ label, hint, values, placeholder, onChange }: Props) {
  // Always render one empty row at the end so adding an item needs no button press;
  // blanks are stripped on save rather than stored.
  const rows = [...values, ""];

  const setAt = (index: number, value: string) => {
    const next = [...values];
    if (index >= next.length) {
      if (value.trim() === "") return;
      next.push(value);
    } else {
      next[index] = value;
    }
    onChange(next);
  };

  const removeAt = (index: number) => onChange(values.filter((_, i) => i !== index));

  return (
    <Form.Group className="mb-3">
      <Form.Label className="fw-semibold">{label}</Form.Label>
      {hint && <Form.Text className="d-block mb-2">{hint}</Form.Text>}

      {rows.map((value, index) => (
        <InputGroup className="mb-2" key={index}>
          <Form.Control
            type="text"
            value={value}
            placeholder={index === rows.length - 1 ? (placeholder ?? "Add another…") : undefined}
            aria-label={`${label} item ${index + 1}`}
            onChange={(e) => setAt(index, e.target.value)}
          />
          <Button
            variant="outline-secondary"
            aria-label={`Remove ${label} item ${index + 1}`}
            disabled={index >= values.length}
            onClick={() => removeAt(index)}
          >
            ✕
          </Button>
        </InputGroup>
      ))}
    </Form.Group>
  );
}
