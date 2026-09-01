import React from 'react';
import Container from 'react-bootstrap/Container';
import Button from 'react-bootstrap/Button';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { useBookingUrl } from '../../fetchers/PublicConfigFetcher';

const scrollToTeam = () => {
    document.getElementById('team')?.scrollIntoView({ behavior: 'smooth' });
};

/**
 * The home page's closing call to action.
 *
 * "Talk to a human" leads to the real booking link (Feature 11) as soon as the API says there
 * is one. Until then — and on an instance with no `BOOKING_URL` configured — it falls back to
 * scrolling down to the counselor profiles, which is what it has always done. Both destinations
 * are honest: one books a session, the other shows who you would be booking.
 *
 * The link is not baked into this build. It comes from `GET /public-config`, so the button and
 * the nudge inside the chat can never point at different places.
 */
const CtaBand = () => {
    const { t } = useI18n();
    const bookingUrl = useBookingUrl();

    // `href` and `onClick` are mutually exclusive here rather than both being set, so there is
    // no moment where clicking both navigates away and scrolls the page it is leaving.
    const humanProps = bookingUrl
        ? { href: bookingUrl, target: '_blank', rel: 'noopener noreferrer' }
        : { onClick: scrollToTeam };

    return (
        <section className="py-4 py-lg-5">
            <Container>
                <div className="bg-sun-gradient text-white text-center p-5 rounded-4">
                    <h2 className="fw-bold mb-2">{t('cta.title')}</h2>
                    <p className="mb-4 fs-5">{t('cta.text')}</p>
                    <div className="d-flex gap-3 justify-content-center flex-wrap">
                        <Button as={Link} to="/chatPage" variant="light" size="lg" className="rounded-pill fw-semibold">
                            {t('cta.chat')}
                        </Button>
                        <Button variant="outline-light" size="lg" className="rounded-pill fw-semibold" {...humanProps}>
                            {t('cta.human')}
                        </Button>
                    </div>
                </div>
            </Container>
        </section>
    );
};

export default CtaBand;
