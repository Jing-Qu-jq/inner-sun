import React, { useState } from 'react';

import Accordion from 'react-bootstrap/Accordion';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import Table from 'react-bootstrap/Table';

import { useI18n } from '../../i18n';
import { checkInspectorToken, clearInspectorToken, setInspectorToken } from '../../fetchers/ConversationFetcher';

/**
 * The retrieval inspector (Feature 22).
 *
 * Shows why a reply is what it is: which Care Patterns the conversation matched, how
 * closely, which of them cleared the relevance floor, and the guidance that was injected
 * into the prompt as a result. Feature 8 added the other half of the same question — how
 * the prompt was assembled, how much of a long conversation was summarized rather than
 * resent, every upstream call the turn made, and what the turn and the conversation have
 * cost so far. Rendered only for a viewer holding the inspector token —
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
export function InspectorBar({ token, onTokenChange, rejected, compare, onCompareChange }) {
    const { t } = useI18n();
    const [draft, setDraft] = useState('');
    // The API's verdict on the token just submitted: '', 'checking', or a failure code.
    const [status, setStatus] = useState('');

    // Checked against the API before anything is stored. Unlocking is otherwise purely local,
    // and the browser has no way to know whether a token is right — so a mistyped one used to
    // buy the bar, the compare switch, and a silent absence of panels.
    const unlock = async () => {
        const value = draft.trim();
        if (!value) return;

        setStatus('checking');
        const outcome = await checkInspectorToken(value);
        if (outcome !== 'ok') {
            setStatus(outcome);
            return;
        }

        setStatus('');
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
                            onChange={(e) => {
                                setDraft(e.target.value);
                                if (status) setStatus('');
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    unlock();
                                }
                            }}
                        />
                        <Button variant="secondary" onClick={unlock} disabled={status === 'checking'}>
                            {t(status === 'checking' ? 'inspector.checking' : 'inspector.unlock')}
                        </Button>
                    </InputGroup>
                    {status && status !== 'checking' ? (
                        <div className="text-danger mt-1">{t(`inspector.unlock.${status}`)}</div>
                    ) : (
                        <div className="text-secondary mt-1">{t('inspector.tokenHint')}</div>
                    )}
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

            {/* Unlocking is local; only the API checks the token, and a wrong one is answered
                with an ordinary response rather than an error. So a rejected token would
                otherwise look identical to a working inspector with nothing to report. */}
            {token && rejected && <div className="text-danger mt-1">{t('inspector.rejected')}</div>}
        </div>
    );
}

const scoreText = (score) => score.toFixed(4);

// Four decimals of a dollar. A turn costs a fraction of a cent and a whole conversation is
// meant to land near five cents, so cents alone would round almost everything to $0.00.
const usdText = (usd) => `$${(usd ?? 0).toFixed(4)}`;

const intText = (n) => (n ?? 0).toLocaleString();

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
            {/* The turn's cost sits beside the match, because the two together are the whole
                argument: researcher-authored guidance, for a fraction of a cent. */}
            {debug.turnCostUsd !== undefined && (
                <Badge bg="light" text="dark" className="ms-1 border">
                    {usdText(debug.turnCostUsd)}
                </Badge>
            )}
            {debug.prompt?.summarizedThisTurn && (
                <Badge bg="info" className="ms-1">
                    {t('inspector.summarizedThisTurn')}
                </Badge>
            )}
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
                                        {intText(debug.usage.promptTokens)}
                                        {debug.usage.cachedPromptTokens > 0 &&
                                            ` (${intText(debug.usage.cachedPromptTokens)} ${t('inspector.cached')})`}{' '}
                                        / {intText(debug.usage.completionTokens)}
                                    </dd>
                                </>
                            )}
                            {debug.turnCostUsd !== undefined && (
                                <>
                                    <dt className="col-6">{t('inspector.cost')}</dt>
                                    <dd className="col-6">
                                        {usdText(debug.turnCostUsd)} / {usdText(debug.conversationCostUsd)}
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

                        {/* Prompt assembly and cost (Feature 8). What keeps a long conversation
                            affordable is invisible in the reply itself: the model sounds exactly
                            the same whether it was sent forty messages or twenty plus a summary. */}
                        {debug.prompt && (
                            <>
                                <div className="fw-semibold">{t('inspector.prompt')}</div>
                                <dl className="row mb-2">
                                    <dt className="col-6">{t('inspector.verbatim')}</dt>
                                    <dd className="col-6">{intText(debug.prompt.verbatimMessages)}</dd>
                                    <dt className="col-6">{t('inspector.summarized')}</dt>
                                    <dd className="col-6">{intText(debug.prompt.summarizedMessages)}</dd>
                                    <dt className="col-6">{t('inspector.maxReplyTokens')}</dt>
                                    <dd className="col-6">{intText(debug.prompt.maxReplyTokens)}</dd>
                                </dl>
                                {debug.prompt.summary ? (
                                    <pre className="inspector-guidance small bg-white border rounded p-2">
                                        {debug.prompt.summary}
                                    </pre>
                                ) : (
                                    <p className="text-secondary">{t('inspector.noSummary')}</p>
                                )}
                            </>
                        )}

                        {debug.calls?.length > 0 && (
                            <>
                                <div className="fw-semibold">{t('inspector.calls')}</div>
                                <Table size="sm" borderless className="mb-3">
                                    <thead>
                                        <tr className="text-secondary">
                                            <th>{t('inspector.callStep')}</th>
                                            <th>{t('inspector.callModel')}</th>
                                            <th className="text-end">{t('inspector.callTokens')}</th>
                                            <th className="text-end">{t('inspector.callCost')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {debug.calls.map((call, index) => (
                                            <tr key={`${call.step}-${index}`}>
                                                <td>
                                                    <code>{call.step}</code>
                                                </td>
                                                <td>{call.model}</td>
                                                <td className="text-end">
                                                    {intText(call.promptTokens)}
                                                    {call.cachedPromptTokens > 0 &&
                                                        ` (${intText(call.cachedPromptTokens)} ${t('inspector.cached')})`}{' '}
                                                    / {intText(call.completionTokens)}
                                                </td>
                                                <td className="text-end">{usdText(call.costUsd)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </Table>
                            </>
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
