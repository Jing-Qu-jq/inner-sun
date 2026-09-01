import React from 'react';

import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import { CalendarHeart } from 'react-bootstrap-icons';

import { useI18n } from '../../i18n';

/**
 * The booking entry point (Feature 11 AC 3).
 *
 * Rendered under the reply on the single turn where the API's readiness check fired, and on no
 * other turn of that conversation. Three things about it are deliberate:
 *
 *   • **The link comes from the API, verbatim.** `BOOKING_URL` is server configuration, and
 *     the browser neither knows it nor derives it. That is the same rule Feature 9 applies to
 *     hotline numbers, for a milder version of the same reason: a wrong destination turns a
 *     student away at the exact moment they decided to ask for help.
 *   • **It is quiet, not a conversion widget.** No badge, no urgency, no second call to
 *     action. The reply above it has already made the invitation in words; this is only the
 *     door. A card that shouted would undo the tone the whole product is built on.
 *   • **It never reappears.** The card lives on the message it arrived with, so it stays where
 *     it was said and scrolls away like anything else. "At most once per conversation" is
 *     enforced on the server (`conversations.booking_nudged_at`), not by hiding this.
 *
 * The link opens in a new tab: a student mid-conversation who taps through to a scheduling
 * page and then hits Back would otherwise find the chat gone.
 */
export function BookingInvite({ booking }) {
    const { t } = useI18n();
    if (!booking?.url) return null;

    return (
        <Card className="booking-invite mt-2 border-primary-subtle">
            <Card.Body className="p-3">
                <div className="d-flex align-items-center gap-2 mb-1">
                    <CalendarHeart className="text-primary flex-shrink-0" size={18} />
                    <strong>{t('chat.booking.title')}</strong>
                </div>
                <p className="small text-body-secondary mb-2">{t('chat.booking.body')}</p>
                <Button
                    href={booking.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="primary"
                    size="sm"
                    className="rounded-pill fw-semibold"
                >
                    {t('chat.booking.cta')}
                </Button>
            </Card.Body>
        </Card>
    );
}

export default BookingInvite;
