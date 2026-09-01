import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import CtaBand from './index';
import { LanguageProvider } from '../../i18n';
import { clearPublicConfigCache } from '../../fetchers/PublicConfigFetcher';

/**
 * The home page's "Talk to a human" button (Feature 11 AC 3).
 *
 * Two branches, and the fallback is the one worth a test: an instance with no `BOOKING_URL`
 * — or an API that cannot be reached — must still leave a button that does something, which
 * is what it did before there was a booking link at all. That branch is invisible in the
 * browser, because it lasts only until the fetch resolves.
 */

const renderBand = () =>
    render(
        <LanguageProvider>
            {/* The same future flags App sets on its HashRouter, so this suite does not
                emit the v7 warnings the app itself has already opted out of. */}
            <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <CtaBand />
            </MemoryRouter>
        </LanguageProvider>,
    );

beforeEach(() => {
    // The config is cached in a module-level promise, which would otherwise carry one test's
    // answer into the next.
    clearPublicConfigCache();
    localStorage.clear();
});

afterEach(() => {
    delete global.fetch;
});

test('links "Talk to a human" to the booking URL the API supplies', async () => {
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ bookingUrl: 'https://example.test/book' }),
    });

    renderBand();

    await waitFor(() => {
        expect(screen.getByText(/Talk to a human/i).closest('a')).toHaveAttribute(
            'href',
            'https://example.test/book',
        );
    });
    // A new tab, so a student part-way through a conversation does not lose the page.
    expect(screen.getByText(/Talk to a human/i).closest('a')).toHaveAttribute('target', '_blank');
});

test('falls back to the counselor profiles when no booking URL is configured', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

    renderBand();

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const human = screen.getByText(/Talk to a human/i);
    expect(human.closest('a')).toBeNull();
    expect(human.closest('button')).toBeInTheDocument();
});

test('an unreachable API leaves the button working', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));

    renderBand();

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText(/Talk to a human/i).closest('button')).toBeInTheDocument();
});
