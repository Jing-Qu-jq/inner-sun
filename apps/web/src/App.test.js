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

// The real world map (react-simple-maps + topojson) is heavy and irrelevant to
// the smoke test; stub it out.
jest.mock('./components/ConnectionMap', () => () => <div data-testid="connection-map" />);

// The home page asks the API where to book a counselor (Feature 11). A shell smoke test must
// not depend on a server being up — left unstubbed it either hits a real localhost API or
// leaves a pending request behind, and which of those happens depends on whether the
// developer had `npm run dev` running. CtaBand's own suite covers both answers properly.
jest.mock('./fetchers/PublicConfigFetcher', () => ({
    useBookingUrl: () => '',
    fetchPublicConfig: async () => ({}),
    clearPublicConfigCache: () => {},
}));

test('renders the InnerSun app shell', () => {
    render(<App />);

    // Brand appears in the header and footer.
    expect(screen.getAllByText(/InnerSun/i).length).toBeGreaterThan(0);

    // Chat funnel entry points are present (nav link + hero/CTA buttons).
    expect(screen.getAllByText(/Start chatting/i).length).toBeGreaterThan(0);

    // Home hero copy renders.
    expect(screen.getByText(/wherever home is/i)).toBeInTheDocument();
});

test('team carousel is clearly labelled as sample content', () => {
    render(<App />);

    // The team section is marked as placeholder/sample content.
    expect(screen.getByText(/Sample content/i)).toBeInTheDocument();

    const carousel = screen.getByTestId('splide');
    expect(within(carousel).getAllByText(/Sample/i).length).toBeGreaterThan(0);
});
