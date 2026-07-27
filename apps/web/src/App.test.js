import { render, screen, within } from '@testing-library/react';
import App from './App';

// The Splide carousel ships a CSS-only subpath ("@splidejs/react-splide/css")
// that Jest can't resolve (no ".css" extension for CRA's mapper to catch), and
// its runtime needs browser APIs jsdom lacks. Stub both so the smoke test can
// mount the real app shell without pulling in the third-party carousel.
jest.mock('@splidejs/react-splide/css', () => ({}), { virtual: true });
jest.mock('@splidejs/react-splide', () => ({
    Splide: ({ children }) => <div data-testid="splide">{children}</div>,
    SplideSlide: ({ children }) => <div>{children}</div>,
}));

test('renders the InnerSun app shell', () => {
    render(<App />);

    // Brand appears in the header and footer.
    expect(screen.getAllByText(/InnerSun/i).length).toBeGreaterThan(0);

    // Primary navigation into the chat funnel is present.
    expect(screen.getByText(/Start Chatting/i)).toBeInTheDocument();

    // Home hero copy renders.
    expect(
        screen.getByText(/designed specifically for international students/i),
    ).toBeInTheDocument();
});

test('team carousel is clearly labelled as sample content', () => {
    render(<App />);

    // The team section is marked as placeholder/sample content.
    expect(screen.getByText(/Sample content/i)).toBeInTheDocument();

    const carousel = screen.getByTestId('splide');
    expect(within(carousel).getAllByText(/Sample/i).length).toBeGreaterThan(0);
});
