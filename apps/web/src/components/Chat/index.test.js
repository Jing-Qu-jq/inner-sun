import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Chat from './index';
import ConversationFetcher, {
    ChatRequestError,
    checkInspectorToken,
    clearInspectorToken,
    setInspectorToken,
} from '../../fetchers/ConversationFetcher';

// react-chat-elements needs browser measurement APIs jsdom lacks; stub it with
// a simple list that renders each message's text so we can assert on state.
jest.mock('react-chat-elements/dist/main.css', () => ({}), { virtual: true });
jest.mock('react-chat-elements', () => ({
    MessageList: ({ dataSource }) => (
        <ul data-testid="message-list">
            {dataSource.map((m) => (
                <li key={m.id} data-position={m.position} className={m.className}>
                    {m.text}
                </li>
            ))}
        </ul>
    ),
}));

// Mock only the network call. The rest of the module (ChatRequestError, the
// length cap) stays real, so these tests fail if the error contract changes.
// A factory rather than a closure over test state — see the beforeEach below.
jest.mock('../../fetchers/ConversationFetcher', () => ({
    __esModule: true,
    ...jest.requireActual('../../fetchers/ConversationFetcher'),
    default: jest.fn(),
    // The API is the only thing that can judge a token, so the unlock path is a network
    // call too — mocked here so each test states the verdict it is exercising.
    checkInspectorToken: jest.fn(),
}));

let pending;
beforeEach(() => {
    pending = [];
    checkInspectorToken.mockResolvedValue('ok');
    ConversationFetcher.mockImplementation(
        (args) =>
            new Promise((resolve, reject) => {
                pending.push({ args, resolve, reject });
            }),
    );
});

const send = (text) => {
    const input = screen.getByPlaceholderText('Message InnerSun');
    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: 'Enter' });
};

const messageTexts = () =>
    within(screen.getByTestId('message-list'))
        .getAllByRole('listitem')
        .map((li) => li.textContent);

test('rapid sends are queued, thread one conversation, and fill their own placeholder', async () => {
    render(<Chat />);

    // Two sends fired back-to-back before any reply comes back.
    send('first question');
    send('second question');

    // Both user messages and two pending placeholders show immediately: the
    // queueing is in the network layer, so the UI still feels instant.
    expect(messageTexts()).toEqual(['first question', '...', 'second question', '...']);

    // Only the first request is in flight. Sending both at once would create
    // two conversations (neither knows the id yet) and interleave the history.
    await waitFor(() => expect(pending).toHaveLength(1));
    expect(pending[0].args).toMatchObject({ message: 'first question', locale: 'en' });
    expect(pending[0].args.conversationId).toBeFalsy();

    pending[0].resolve({ reply: 'answer to first', conversationId: 'conv-1' });

    // The second request goes out only now — and carries the id the first
    // reply established, which is what makes the server thread the history.
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[1].args).toMatchObject({ message: 'second question', conversationId: 'conv-1' });

    pending[1].resolve({ reply: 'answer to second', conversationId: 'conv-1' });

    await waitFor(() => {
        expect(messageTexts()).toEqual([
            'first question',
            'answer to first',
            'second question',
            'answer to second',
        ]);
    });
});

test('a failed turn replaces its placeholder with an error message', async () => {
    render(<Chat />);
    send('hello');

    await waitFor(() => expect(pending).toHaveLength(1));
    pending[0].reject(new ChatRequestError('network_error'));

    await waitFor(() => {
        expect(
            screen.getByText(/couldn’t reach InnerSun/i),
        ).toBeInTheDocument();
    });

    // The failure is marked as one, not passed off as an assistant reply.
    const bubbles = within(screen.getByTestId('message-list')).getAllByRole('listitem');
    expect(bubbles[1]).toHaveClass('message-error');
});

test('an unrecognised failure falls back to the generic error message', async () => {
    render(<Chat />);
    send('hello');

    await waitFor(() => expect(pending).toHaveLength(1));
    pending[0].reject(new ChatRequestError('upstream_quota_exhausted'));

    await waitFor(() => {
        expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
});

test('a send that fails does not block the next one', async () => {
    render(<Chat />);
    send('first question');

    await waitFor(() => expect(pending).toHaveLength(1));
    pending[0].reject(new ChatRequestError('network_error'));

    send('second question');
    await waitFor(() => expect(pending).toHaveLength(2));
    pending[1].resolve({ reply: 'answer to second', conversationId: 'conv-1' });

    await waitFor(() => {
        expect(screen.getByText('answer to second')).toBeInTheDocument();
    });
});

test('empty / whitespace-only input does not send', () => {
    render(<Chat />);
    send('   ');
    expect(screen.queryByTestId('message-list')).not.toBeInTheDocument();
    expect(pending).toHaveLength(0);
});

// --- Retrieval inspector (Feature 22) --------------------------------------------------
// AC 1 in test form: an ordinary visitor sees no trace of the inspector, and the panel
// renders only from a `debug` block the API chose to send.

const DEBUG = {
    outcome: 'applied',
    gap: false,
    floor: 0.54,
    matchQuery: 'The student is homesick and misses family meals.',
    candidates: [
        { id: 'p1', title: 'Homesickness & cultural adjustment', score: 0.6716, applied: true },
        { id: 'p2', title: 'Making friends & social belonging', score: 0.4102, applied: false },
    ],
    guidance: '### Closest match: Homesickness & cultural adjustment',
    retrievalMs: 910,
    usage: { promptTokens: 900, cachedPromptTokens: 0, completionTokens: 120, totalTokens: 1020 },
    // Prompt assembly and cost accounting (Feature 8).
    prompt: {
        verbatimMessages: 21,
        summarizedMessages: 10,
        summary: 'The student has been abroad six months and misses home.',
        summarizedThisTurn: true,
        maxReplyTokens: 600,
    },
    calls: [
        { step: 'summary', model: 'gpt-4o-mini', promptTokens: 700, cachedPromptTokens: 0, completionTokens: 150, costUsd: 0.000195 },
        { step: 'match-query', model: 'gpt-4o-mini', promptTokens: 420, cachedPromptTokens: 0, completionTokens: 40, costUsd: 0.000087 },
        { step: 'match-embedding', model: 'text-embedding-3-small', promptTokens: 55, cachedPromptTokens: 0, completionTokens: 0, costUsd: 0.000001 },
        { step: 'reply', model: 'gpt-4o', promptTokens: 900, cachedPromptTokens: 768, completionTokens: 120, costUsd: 0.002490 },
    ],
    turnCostUsd: 0.002773,
    conversationCostUsd: 0.0311,
};

test('an ordinary visitor sees no inspector, even if a reply somehow carried debug', async () => {
    render(<Chat />);
    expect(screen.queryByText('Retrieval inspector')).not.toBeInTheDocument();

    send('I feel homesick');
    await waitFor(() => expect(pending).toHaveLength(1));
    pending[0].resolve({ reply: 'that sounds hard', conversationId: 'conv-1' });

    await waitFor(() => expect(screen.getByText('that sounds hard')).toBeInTheDocument());
    expect(screen.queryByText(/Matched:/)).not.toBeInTheDocument();
});

test('with a token, a reply shows its matched pattern and score', async () => {
    setInspectorToken('secret-token');
    render(<Chat />);
    expect(screen.getByText('Retrieval inspector')).toBeInTheDocument();

    send('I feel homesick');
    await waitFor(() => expect(pending).toHaveLength(1));
    pending[0].resolve({ reply: 'that sounds hard', conversationId: 'conv-1', debug: DEBUG });

    await waitFor(() => {
        expect(screen.getByText(/Matched: Homesickness & cultural adjustment · 0\.6716/)).toBeInTheDocument();
    });
    clearInspectorToken();
});

// The API is the only thing that knows whether a token is right, so Unlock asks it before
// storing anything. Without this, a mistyped token bought the bar, the compare switch, and a
// silent absence of panels — which reads as "the inspector found nothing".
test('a token the API rejects is refused at unlock, and nothing is stored', async () => {
    checkInspectorToken.mockResolvedValue('invalid');
    window.location.hash = '#/chatPage?inspect=1';
    render(<Chat />);

    fireEvent.change(screen.getByPlaceholderText('Inspector token'), {
        target: { value: 'definitely-wrong' },
    });
    fireEvent.click(screen.getByText('Unlock'));

    await waitFor(() => {
        expect(screen.getByText(/was not accepted by the API/i)).toBeInTheDocument();
    });
    // Still locked, and the compare switch never appeared.
    expect(screen.getByPlaceholderText('Inspector token')).toBeInTheDocument();
    expect(screen.queryByText(/Also answer without/i)).not.toBeInTheDocument();
    window.location.hash = '';
});

test('an API with no INSPECTOR_TOKEN set says so, rather than blaming the token', async () => {
    checkInspectorToken.mockResolvedValue('not_configured');
    window.location.hash = '#/chatPage?inspect=1';
    render(<Chat />);

    fireEvent.change(screen.getByPlaceholderText('Inspector token'), { target: { value: 'anything' } });
    fireEvent.click(screen.getByText('Unlock'));

    await waitFor(() => {
        expect(screen.getByText(/without INSPECTOR_TOKEN set/i)).toBeInTheDocument();
    });
    window.location.hash = '';
});

// --- Prompt assembly and cost (Feature 8) ----------------------------------------------
// The panel is where the cost controls become demonstrable: a reply reads exactly the same
// whether the model was sent the whole conversation or twenty messages plus a summary, so
// the only place the difference is visible at all is here.
test('an inspected turn shows what it cost and how much history was summarized', async () => {
    setInspectorToken('secret-token');
    render(<Chat />);

    send('I feel homesick');
    await waitFor(() => expect(pending).toHaveLength(1));
    pending[0].resolve({ reply: 'that sounds hard', conversationId: 'conv-1', debug: DEBUG });

    // The turn's cost and the summarization badge sit next to the match, before anything is
    // expanded — the point is that they are visible while demonstrating, not buried.
    await waitFor(() => expect(screen.getByText('$0.0028')).toBeInTheDocument());
    expect(screen.getByText('Summarized')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Why this reply'));

    // Per-call rows: four calls, and only one of them on the expensive model. That is the
    // model tiering from AC 2, shown rather than asserted.
    expect(screen.getByText('reply')).toBeInTheDocument();
    expect(screen.getByText('match-embedding')).toBeInTheDocument();
    expect(screen.getAllByText('gpt-4o-mini')).toHaveLength(2);
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();

    // Cached prompt tokens are what proves prompt caching engaged (AC 4).
    expect(screen.getAllByText(/768 cached/).length).toBeGreaterThan(0);

    // History composition: twenty-one messages in full, ten replaced by the summary.
    expect(screen.getByText('Messages replaced by the summary')).toBeInTheDocument();
    expect(screen.getByText('The student has been abroad six months and misses home.')).toBeInTheDocument();
    clearInspectorToken();
});

// A wrong token, or an API running without INSPECTOR_TOKEN, is answered with an ordinary
// response by design — so the panel must say so rather than looking like a working inspector
// that happened to have nothing to report.
test('a token the API rejects is reported instead of failing silently', async () => {
    setInspectorToken('wrong-token');
    render(<Chat />);

    send('I feel homesick');
    await waitFor(() => expect(pending).toHaveLength(1));
    // No `debug` — exactly what an ordinary visitor gets.
    pending[0].resolve({ reply: 'that sounds hard', conversationId: 'conv-1' });

    await waitFor(() => {
        expect(screen.getByText(/no inspector data/i)).toBeInTheDocument();
    });
    clearInspectorToken();
});

test('a token the API accepts shows no rejection notice', async () => {
    setInspectorToken('secret-token');
    render(<Chat />);

    send('I feel homesick');
    await waitFor(() => expect(pending).toHaveLength(1));
    pending[0].resolve({ reply: 'that sounds hard', conversationId: 'conv-1', debug: DEBUG });

    await waitFor(() => expect(screen.getByText(/Matched:/)).toBeInTheDocument());
    expect(screen.queryByText(/no inspector data/i)).not.toBeInTheDocument();
    clearInspectorToken();
});

test('a turn that matched nothing is labelled a gap rather than a match', async () => {
    setInspectorToken('secret-token');
    render(<Chat />);

    send('someone stole my bike');
    await waitFor(() => expect(pending).toHaveLength(1));
    pending[0].resolve({
        reply: 'that is frustrating',
        conversationId: 'conv-1',
        debug: { ...DEBUG, outcome: 'below_floor', gap: true, guidance: '', candidates: [
            { id: 'p2', title: 'Making friends & social belonging', score: 0.2764, applied: false },
        ] },
    });

    await waitFor(() => {
        expect(screen.getByText(/No Care Pattern matched/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Care-Pattern gap/)).toBeInTheDocument();
    clearInspectorToken();
});

test('adding ?inspect=1 to an open page reveals the bar without a reload', async () => {
    window.location.hash = '#/chatPage';
    render(<Chat />);
    expect(screen.queryByText('Retrieval inspector')).not.toBeInTheDocument();

    // What a person actually does: edit the address bar of the page already open. Under
    // HashRouter that fires hashchange and never remounts this component.
    act(() => {
        window.location.hash = '#/chatPage?inspect=1';
        window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    await waitFor(() => {
        expect(screen.getByText('Retrieval inspector')).toBeInTheDocument();
    });
    window.location.hash = '';
});
