import React from 'react';

import Alert from 'react-bootstrap/Alert';
import { LifePreserver } from 'react-bootstrap-icons';

import { useI18n } from '../../i18n';

/**
 * The crisis resources panel (Feature 9 AC 2).
 *
 * Rendered under the reply on a turn the API screened as a crisis, and on no other turn.
 * Three things about it are deliberate:
 *
 *   • **The services come from the API, verbatim.** Nothing here is looked up, formatted or
 *     chosen in the browser. The server decided this was a crisis and the server chose the
 *     list, so the panel's only job is to show it — a client that assembled its own list
 *     could show a stale one, or none, and neither failure would be visible.
 *   • **It appears whether or not the model cooperated.** The reply above it may be the
 *     fixed fallback text the API substitutes when the reply call fails, and this panel
 *     looks exactly the same either way. That is the point: the numbers are the part that
 *     had to arrive.
 *   • **It is calm, not alarming.** A red error-styled banner reads as "you have done
 *     something wrong" at the moment a student is least able to absorb that. `warning` is
 *     the register this needs — clearly important, not a klaxon.
 *
 * Contacts are shown as plain text rather than `tel:` links: which number applies depends on
 * where the student is, and a tappable link is an invitation to press the wrong one.
 */
export function CrisisNotice({ crisis }) {
    const { t } = useI18n();
    if (!crisis?.resources?.length) return null;

    return (
        <Alert variant="warning" className="crisis-notice mt-2 mb-0 p-3">
            <div className="d-flex align-items-center gap-2 mb-1">
                <LifePreserver className="flex-shrink-0" size={18} />
                <strong>{t('chat.crisis.title')}</strong>
            </div>
            <p className="small mb-2">{t('chat.crisis.body')}</p>

            <ul className="list-unstyled mb-2">
                {crisis.resources.map((resource) => (
                    <li key={`${resource.name}-${resource.contact}`} className="mb-2">
                        <div className="fw-semibold small">{resource.name}</div>
                        <div>{resource.contact}</div>
                        {resource.note && <div className="small text-body-secondary">{resource.note}</div>}
                    </li>
                ))}
            </ul>

            <div className="small fw-semibold mb-0">{t('chat.crisis.emergency')}</div>
        </Alert>
    );
}

export default CrisisNotice;
