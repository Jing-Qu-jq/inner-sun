import { useEffect, useState } from 'react';

import { API_BASE_URL } from './ConversationFetcher';

/**
 * Public configuration the app needs before it has anything to send (Feature 11).
 *
 * Today that is one field: where a student goes to book a real counselor. Inside the chat the
 * link arrives attached to the turn that nudged, because the server is what decided to nudge.
 * The home page's "Talk to a human" button has no turn to ride on, so it asks.
 *
 * **Why ask the API rather than read a `REACT_APP_BOOKING_URL`.** The API already holds the
 * authoritative value — it is what decides whether the nudge exists at all, and what it hands
 * to students. A build-time copy in the web app would be a second source of the same fact,
 * settable independently, and the failure it produces is invisible: the site keeps working and
 * quietly sends people to a link the API stopped using. One fetch is cheaper than that.
 *
 * Fetched once per page load and shared. The result is cached as a *promise*, so several
 * components mounting together make one request between them rather than one each.
 */

// A short budget on purpose. Nothing on the page is waiting for this — the button works
// without it — so a slow or missing API should cost a moment, not a hung render.
const REQUEST_TIMEOUT_MS = 5000;

let cached;

/**
 * The public config, or `{}` when the API cannot be reached.
 *
 * Never rejects. This is decoration on a page that has to render regardless, and an
 * unreachable API here means the site's marketing pages should still work — the fallback is
 * simply the behaviour that existed before there was a booking link at all.
 */
export function fetchPublicConfig() {
    if (!cached) {
        cached = (async () => {
            // AbortController + setTimeout rather than the tidier `AbortSignal.timeout`,
            // which jsdom does not implement — under Jest that threw before `fetch` was
            // ever called, so the request silently never happened and every test saw the
            // "no link configured" branch. A timeout that can skip the call it is timing
            // is worse than no timeout.
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
            try {
                const response = await fetch(`${API_BASE_URL}/public-config`, { signal: controller.signal });
                if (!response.ok) return {};
                const body = await response.json();
                return body && typeof body === 'object' ? body : {};
            } catch {
                return {};
            } finally {
                clearTimeout(timer);
            }
        })();
    }
    return cached;
}

/** Reset the cache. Tests only — a module-level promise otherwise leaks between them. */
export function clearPublicConfigCache() {
    cached = undefined;
}

/**
 * The booking link, or `''` until it arrives (and forever, if none is configured).
 *
 * Deliberately falsy while in flight rather than a loading flag: every caller's job is to fall
 * back to what it did before, and "not yet" and "never" want exactly the same treatment for
 * the fraction of a second between them.
 */
export function useBookingUrl() {
    const [bookingUrl, setBookingUrl] = useState('');

    useEffect(() => {
        let live = true;
        fetchPublicConfig().then((config) => {
            if (live && config.bookingUrl) setBookingUrl(config.bookingUrl);
        });
        return () => {
            live = false;
        };
    }, []);

    return bookingUrl;
}
