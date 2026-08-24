import ConversationFetcher, {
    ChatRequestError,
    clearInspectorToken,
    setInspectorToken,
} from './ConversationFetcher';

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
    clearInspectorToken();
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

// --- Retrieval inspector credential (Feature 22) --------------------------------------
// The rule these protect: an ordinary visitor's request is the same request it was before
// the inspector existed, and the token travels only when someone deliberately set one.

test('sends no inspector header when no token is set', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, { conversationId: 'conv-1', reply: 'hi', locale: 'en' }));

    await ConversationFetcher({ message: 'hello', locale: 'en' });

    const { init } = lastRequest();
    expect(init.headers['X-InnerSun-Inspect']).toBeUndefined();
    expect(init.headers['X-InnerSun-Inspect-Compare']).toBeUndefined();
});

test('sends the inspector token, and the compare header only when asked', async () => {
    setInspectorToken('secret-token');
    global.fetch.mockResolvedValue(jsonResponse(200, { conversationId: 'conv-1', reply: 'hi', locale: 'en' }));

    await ConversationFetcher({ message: 'hello', locale: 'en' });
    expect(lastRequest().init.headers['X-InnerSun-Inspect']).toBe('secret-token');
    expect(lastRequest().init.headers['X-InnerSun-Inspect-Compare']).toBeUndefined();

    await ConversationFetcher({ message: 'hello again', locale: 'en', compare: true });
    expect(lastRequest().init.headers['X-InnerSun-Inspect-Compare']).toBe('1');

    clearInspectorToken();
    await ConversationFetcher({ message: 'and again', locale: 'en', compare: true });
    expect(lastRequest().init.headers['X-InnerSun-Inspect']).toBeUndefined();
});

test('passes the debug block through when the API returns one', async () => {
    const debug = { outcome: 'applied', gap: false, floor: 0.54, candidates: [], guidance: '', retrievalMs: 900 };
    global.fetch.mockResolvedValue(
        jsonResponse(200, { conversationId: 'conv-1', reply: 'hi', locale: 'en', debug }),
    );

    const result = await ConversationFetcher({ message: 'hello', locale: 'en' });
    expect(result.debug).toEqual(debug);
});

test('a response with no debug block yields no debug', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, { conversationId: 'conv-1', reply: 'hi', locale: 'en' }));

    const result = await ConversationFetcher({ message: 'hello', locale: 'en' });
    expect(result.debug).toBeUndefined();
});
