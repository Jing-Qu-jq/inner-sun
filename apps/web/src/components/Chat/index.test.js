import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Chat from './index';
import ConversationFetcher from '../../fetchers/ConversationFetcher';

// react-chat-elements needs browser measurement APIs jsdom lacks; stub it with
// a simple list that renders each message's text so we can assert on state.
jest.mock('react-chat-elements/dist/main.css', () => ({}), { virtual: true });
jest.mock('react-chat-elements', () => ({
    MessageList: ({ dataSource }) => (
        <ul data-testid="message-list">
            {dataSource.map((m) => (
                <li key={m.id} data-position={m.position}>
                    {m.text}
                </li>
            ))}
        </ul>
    ),
}));

// Auto-mock the fetcher; its implementation is set per-test below so it can
// close over `pending` in test scope (avoids the jest.mock hoisting trap).
jest.mock('../../fetchers/ConversationFetcher');

let pending;
beforeEach(() => {
    pending = [];
    ConversationFetcher.mockImplementation(
        (question) =>
            new Promise((resolve) => {
                pending.push({ question, resolve });
            }),
    );
});

const send = (text) => {
    const input = screen.getByPlaceholderText('Message InnerSun');
    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: 'Enter' });
};

test('rapid sends keep every message and replace the right placeholder', async () => {
    render(<Chat />);

    // Two sends fired back-to-back before any reply comes back.
    send('first question');
    send('second question');

    // Both user messages and two pending placeholders are present, in order.
    let items = within(screen.getByTestId('message-list')).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
        'first question',
        '...',
        'second question',
        '...',
    ]);

    // Replies resolve out of order: the second send resolves first.
    expect(pending).toHaveLength(2);
    pending[1].resolve('answer to second');
    pending[0].resolve('answer to first');

    await waitFor(() => {
        items = within(screen.getByTestId('message-list')).getAllByRole('listitem');
        expect(items.map((li) => li.textContent)).toEqual([
            'first question',
            'answer to first',
            'second question',
            'answer to second',
        ]);
    });
});

test('empty / whitespace-only input does not send', () => {
    render(<Chat />);
    send('   ');
    expect(screen.queryByTestId('message-list')).not.toBeInTheDocument();
    expect(pending).toHaveLength(0);
});
