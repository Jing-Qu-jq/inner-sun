import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Chat from './index';
import ConversationFetcher, {
    ChatRequestError,
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
}));

let pending;
beforeEach(() => {
    pending = [];
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
    usage: { promptTokens: 900, completionTokens: 120, totalTokens: 1020 },
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
