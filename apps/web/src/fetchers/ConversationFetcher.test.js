import ConversationFetcher, { ChatRequestError } from './ConversationFetcher';

// Every test drives the real fetcher against a stubbed fetch, so what is being
// checked is the request we actually put on the wire.
const jsonResponse = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

const lastRequest = () => {
    const [url, init] = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
    return { url, init, body: JSON.parse(init.body) };
};

beforeEach(() => {
    global.fetch = jest.fn();
});

afterEach(() => {
    delete global.fetch;
});

test('posts to our own API, never to OpenAI', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, { conversationId: 'conv-1', reply: 'hi there', locale: 'en' }));

    const result = await ConversationFetcher({ message: 'hello', locale: 'en' });

    const { url, init, body } = lastRequest();
    expect(url).toBe('http://localhost:3001/chat');
    expect(url).not.toContain('openai');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBeUndefined();
    // No conversationId on the first turn — the API mints one.
    expect(body).toEqual({ message: 'hello', locale: 'en' });
    expect(result).toEqual({ conversationId: 'conv-1', reply: 'hi there', locale: 'en' });
});

test('sends the conversation id on a later turn', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, { conversationId: 'conv-1', reply: 'go on', locale: 'en' }));

    await ConversationFetcher({ message: 'and then?', conversationId: 'conv-1', locale: 'en' });

    expect(lastRequest().body).toEqual({ message: 'and then?', locale: 'en', conversationId: 'conv-1' });
});

test('a stale conversation id is retried once as a fresh conversation', async () => {
    global.fetch
        .mockResolvedValueOnce(
            jsonResponse(404, { error: { code: 'conversation_not_found', message: 'gone' } }),
        )
        .mockResolvedValueOnce(
            jsonResponse(200, { conversationId: 'conv-2', reply: 'starting over', locale: 'en' }),
        );

    const result = await ConversationFetcher({ message: 'hello', conversationId: 'conv-old', locale: 'en' });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    // The retry drops the dead id rather than repeating it.
    expect(lastRequest().body.conversationId).toBeUndefined();
    expect(result.conversationId).toBe('conv-2');
});

test('surfaces the API error code so the UI can choose its wording', async () => {
    global.fetch.mockResolvedValue(
        jsonResponse(503, { error: { code: 'upstream_rate_limited', message: 'busy' } }),
    );

    await expect(ConversationFetcher({ message: 'hello', locale: 'en' })).rejects.toMatchObject({
        name: 'ChatRequestError',
        code: 'upstream_rate_limited',
        status: 503,
    });
});

test('a transport failure becomes a network_error', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(ConversationFetcher({ message: 'hello', locale: 'en' })).rejects.toMatchObject({
        code: 'network_error',
    });
});

test('a 200 that is not a usable reply is treated as a failed turn', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, { conversationId: 'conv-1' }));

    await expect(ConversationFetcher({ message: 'hello', locale: 'en' })).rejects.toBeInstanceOf(ChatRequestError);
});
