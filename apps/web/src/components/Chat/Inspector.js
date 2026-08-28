import React, { useState } from 'react';

import Accordion from 'react-bootstrap/Accordion';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import Table from 'react-bootstrap/Table';

import { useI18n } from '../../i18n';
import { clearInspectorToken, setInspectorToken } from '../../fetchers/ConversationFetcher';

/**
 * The retrieval inspector (Feature 22).
 *
 * Shows why a reply is what it is: which Care Patterns the conversation matched, how
 * closely, which of them cleared the relevance floor, and the guidance that was injected
 * into the prompt as a result. Rendered only for a viewer holding the inspector token —
 * an ordinary visitor's response carries no `debug` object at all, so there is nothing
 * here to render and no code path that could reveal the knowledge base to them.
 *
 * All of it comes straight from the API. Nothing is recomputed in the browser, because a
 * panel that derived its own numbers could disagree with the turn it claims to explain.
 */

/** The URL asks for the inspector: ?inspect=1, in the query or after the hash route. */
export function inspectorRequested() {
    try {
        const { search, hash } = window.location;
        const afterHash = hash.includes('?') ? hash.slice(hash.indexOf('?')) : '';
        return (
            new URLSearchParams(search).get('inspect') === '1' ||
            new URLSearchParams(afterHash).get('inspect') === '1'
        );
    } catch {
        return false;
    }
}

/**
 * The controls: paste the token to unlock, then optionally ask for the comparison reply.
 *
 * Deliberately plain and unbranded — it appears above the composer only when the inspector
 * has been asked for, and a student who never adds ?inspect=1 never sees it.
 */
export function InspectorBar({ token, onTokenChange, compare, onCompareChange }) {
    const { t } = useI18n();
    const [draft, setDraft] = useState('');

    const unlock = () => {
        const value = draft.trim();
        if (!value) return;
        setInspectorToken(value);
        onTokenChange(value);
        setDraft('');
    };

    return (
        <div className="inspector-bar border rounded p-2 mb-2 small bg-light">
            <div className="d-flex align-items-center gap-2 mb-1">
                <Badge bg="dark">{t('inspector.title')}</Badge>
                {token && (
                    <Button
                        size="sm"
                        variant="outline-secondary"
                        className="ms-auto py-0"
                        onClick={() => {
                            clearInspectorToken();
                            onTokenChange('');
                            onCompareChange(false);
                        }}
                    >
                        {t('inspector.lock')}
                    </Button>
                )}
            </div>

            {!token && (
                <>
                    <InputGroup size="sm">
                        <Form.Control
                            type="password"
                            value={draft}
                            placeholder={t('inspector.tokenLabel')}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    unlock();
                                }
                            }}
                        />
                        <Button variant="secondary" onClick={unlock}>
                            {t('inspector.unlock')}
                        </Button>
                    </InputGroup>
                    <div className="text-secondary mt-1">{t('inspector.tokenHint')}</div>
                </>
            )}

            {token && (
                <Form.Check
                    type="switch"
                    id="inspector-compare"
                    checked={compare}
                    onChange={(e) => onCompareChange(e.target.checked)}
                    label={t('inspector.compare')}
                />
            )}
        </div>
    );
}

const scoreText = (score) => score.toFixed(4);

/** The per-turn panel, rendered underneath the reply it explains. */
export function InspectorPanel({ debug, reply }) {
    const { t } = useI18n();
    if (!debug) return null;

    const top = debug.candidates?.[0];
    const applied = debug.candidates?.filter((c) => c.applied) ?? [];
    const summary =
        applied.length > 0
            ? `${t('inspector.matched')}: ${applied[0].title} · ${scoreText(applied[0].score)}`
            : `${t('inspector.noMatch')}${top ? ` · ${scoreText(top.score)}` : ''}`;

    return (
        <div className="inspector-panel mt-2 pt-2 border-top small">
            <Badge bg={applied.length > 0 ? 'primary' : 'secondary'}>{summary}</Badge>
            {debug.gap && <div className="text-secondary mt-1">{t('inspector.gapNote')}</div>}

            <Accordion flush className="inspector-accordion mt-1">
                <Accordion.Item eventKey="0">
                    <Accordion.Header>{t('inspector.details')}</Accordion.Header>
                    <Accordion.Body>
                        <dl className="row mb-2">
                            <dt className="col-6">{t('inspector.outcome')}</dt>
                            <dd className="col-6">
                                <code>{debug.outcome}</code>
                            </dd>
                            <dt className="col-6">{t('inspector.floor')}</dt>
                            <dd className="col-6">{debug.floor}</dd>
                            <dt className="col-6">{t('inspector.retrievalMs')}</dt>
                            <dd className="col-6">{debug.retrievalMs} ms</dd>
                            {debug.usage && (
                                <>
                                    <dt className="col-6">{t('inspector.tokens')}</dt>
                                    <dd className="col-6">
                                        {debug.usage.promptTokens} / {debug.usage.completionTokens}
                                    </dd>
                                </>
                            )}
                        </dl>

                        {debug.matchQuery && (
                            <>
                                <div className="fw-semibold">{t('inspector.matchQuery')}</div>
                                <p className="fst-italic text-secondary">{debug.matchQuery}</p>
                            </>
                        )}

                        {debug.candidates?.length > 0 && (
                            <>
                                <div className="fw-semibold">{t('inspector.candidates')}</div>
                                <Table size="sm" borderless className="mb-3">
                                    <tbody>
                                        {debug.candidates.map((c) => (
                                            <tr key={c.id}>
                                                <td>{c.title}</td>
                                                <td className="text-end">{scoreText(c.score)}</td>
                                                <td className="text-end" style={{ width: '5rem' }}>
                                                    {c.applied ? `✓ ${t('inspector.applied')}` : ''}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </Table>
                            </>
                        )}

                        <div className="fw-semibold">{t('inspector.guidance')}</div>
                        {debug.guidance ? (
                            <pre className="inspector-guidance small bg-white border rounded p-2">{debug.guidance}</pre>
                        ) : (
                            <p className="text-secondary">{t('inspector.noGuidance')}</p>
                        )}

                        {/* The comparison: the same turn answered with the guidance withheld.
                            Shown next to the real reply, because the difference between them
                            is the entire argument for the knowledge base. */}
                        {debug.replyWithoutGuidance && (
                            <div className="row g-2">
                                <div className="col-md-6">
                                    <div className="fw-semibold">{t('inspector.withGuidance')}</div>
                                    <div className="border rounded p-2 bg-white">{reply}</div>
                                </div>
                                <div className="col-md-6">
                                    <div className="fw-semibold">{t('inspector.withoutGuidance')}</div>
                                    <div className="border rounded p-2 bg-white text-secondary">
                                        {debug.replyWithoutGuidance}
                                    </div>
                                </div>
                            </div>
                        )}
                    </Accordion.Body>
                </Accordion.Item>
            </Accordion>
        </div>
    );
}
