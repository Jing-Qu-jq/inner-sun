import React, { useState, useRef } from 'react';

import { MessageList } from 'react-chat-elements';
import 'react-chat-elements/dist/main.css';

import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { ChatHeart } from 'react-bootstrap-icons';

import paperAirplaneIcon from '../../images/paper_airplane.svg';
import ConversationFetcher, { MAX_MESSAGE_LENGTH } from '../../fetchers/ConversationFetcher';
import { useI18n } from '../../i18n';

// Monotonic counter for stable, unique message ids so the pending
// placeholder for each send can be located and replaced independently
// (correct even when several sends are in flight at once).
let messageIdCounter = 0;
const nextMessageId = () => {
    messageIdCounter += 1;
    return `msg-${messageIdCounter}`;
};

// Failure codes worth a specific explanation. Anything else — an unreachable
// model, an exhausted quota, a database we can't read — is not something the
// student can act on differently, so it gets the generic apology.
const ERROR_MESSAGE_KEYS = {
    network_error: 'chat.error.offline',
    timeout: 'chat.error.timeout',
    upstream_rate_limited: 'chat.error.busy',
};

function Chat() {
    const { t, locale } = useI18n();
    const messageListReference = React.createRef();
    const inputRef = useRef(null);

    const [chatMode, setChatMode] = useState(false);
    const [question, setQuestion] = useState('');
    const [messageList, setMessageList] = useState([]);

    // The server owns the transcript (Feature 5): all this component keeps is
    // the id identifying it, held for the life of the page rather than in
    // storage — a reload starts a visibly empty chat, so silently resuming a
    // conversation whose messages are no longer on screen would be confusing.
    const conversationIdRef = useRef(null);

    // Turns are sent one at a time. Two requests in flight against the same
    // conversation would interleave server-side as user-1, user-2, reply-2,
    // reply-1, and a first pair sent together would create two conversations
    // because neither knows the id yet. Queueing costs nothing here: both
    // messages still appear immediately, only the network calls are ordered.
    const sendQueueRef = useRef(Promise.resolve());

    // Suggested conversation starters for the empty state. Clicking one pre-fills
    // the input; later some become deterministic canned answers (Feature 10).
    const starters = [
        t('chat.starter.homesick'),
        t('chat.starter.stress'),
        t('chat.starter.friends'),
        t('chat.starter.human'),
    ];

    const handleStarter = (text) => {
        setQuestion(text);
        inputRef.current?.focus();
    };

    // Swap a pending placeholder for whatever the turn produced, leaving every
    // other message alone — correct even when several sends are outstanding.
    const resolvePlaceholder = (placeholderId, resolved) => {
        setMessageList((prev) =>
            prev.map((item) =>
                item.id === placeholderId ? { ...item, ...resolved, date: new Date() } : item,
            ),
        );
    };

    const sendQuestion = () => {
        const text = question.trim();
        if (!text) {
            return;
        }

        setChatMode(true);
        setQuestion('');

        const userMessage = {
            id: nextMessageId(),
            position: 'right',
            type: 'text',
            date: new Date(),
            text,
        };
        const placeholderId = nextMessageId();
        const placeholder = {
            id: placeholderId,
            position: 'left',
            type: 'text',
            date: new Date(),
            text: '...',
            className: 'message-pending',
        };

        // Append immutably via the functional updater so concurrent/rapid
        // sends never read a stale list or overwrite each other.
        setMessageList((prev) => [...prev, userMessage, placeholder]);

        sendQueueRef.current = sendQueueRef.current.then(async () => {
            try {
                const { reply, conversationId } = await ConversationFetcher({
                    message: text,
                    conversationId: conversationIdRef.current,
                    locale,
                });
                // Every later turn carries this, which is how the API knows
                // which stored conversation to append to.
                conversationIdRef.current = conversationId;
                resolvePlaceholder(placeholderId, { text: reply, className: undefined });
            } catch (error) {
                // The key rather than the text: the message is translated at
                // render time, so it follows the language toggle like the rest
                // of the UI even after it is already on screen.
                resolvePlaceholder(placeholderId, {
                    text: '',
                    errorKey: ERROR_MESSAGE_KEYS[error?.code] ?? 'chat.error',
                    className: 'message-error',
                });
            }
        });
    };

    // Error bubbles resolve their wording here rather than at send time.
    const dataSource = messageList.map((item) =>
        item.errorKey ? { ...item, text: t(item.errorKey) } : item,
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {chatMode && (
                <div className="message-list-container">
                    <MessageList
                        referance={messageListReference}
                        className="message-list"
                        lockable
                        toBottomHeight="100%"
                        dataSource={dataSource}
                    />
                </div>
            )}

            {!chatMode && (
                <div className="text-center mt-auto mb-5">
                    <h1 className="fw-bold mb-2">{t('chat.heading')}</h1>
                    <p className="text-secondary mb-0">{t('chat.subheading')}</p>
                </div>
            )}

            <div className="position-relative">
                <Form.Control
                    ref={inputRef}
                    style={{borderRadius: '25px'}}
                    type="text"
                    value={question}
                    maxLength={MAX_MESSAGE_LENGTH}
                    placeholder={t('chat.placeholder')}
                    onChange={(e) => {
                        setQuestion(e.target.value);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            sendQuestion();
                        }
                    }}
                />
                <Button
                    variant="primary"
                    className="btn-send-message"
                    onClick={sendQuestion}
                >
                    <img
                        src={paperAirplaneIcon}
                        alt={t('chat.send')}
                    />
                </Button>
            </div>

            {!chatMode && (
                <div className="mb-auto">
                    <p className="text-secondary text-center mt-2 mb-5" style={{ fontSize: '0.72rem' }}>
                        {t('chat.disclaimer')}
                    </p>
                    <div className="mx-auto" style={{ maxWidth: '640px' }}>
                        {starters.map((text) => (
                            <button
                                key={text}
                                type="button"
                                className="starter-row w-100 text-start d-flex align-items-center gap-3 bg-transparent border-0 border-bottom py-3 px-2"
                                onClick={() => handleStarter(text)}
                            >
                                <ChatHeart className="text-primary flex-shrink-0" size={18} />
                                <span>{text}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Chat;
