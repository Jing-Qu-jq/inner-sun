import React, { useState, useRef } from 'react';

import { MessageList } from 'react-chat-elements';
import 'react-chat-elements/dist/main.css';

import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { ChatHeart } from 'react-bootstrap-icons';

import paperAirplaneIcon from '../../images/paper_airplane.svg';
import ConversationFetcher from '../../fetchers/ConversationFetcher';
import { useI18n } from '../../i18n';

// Monotonic counter for stable, unique message ids so the pending
// placeholder for each send can be located and replaced independently
// (correct even when several sends are in flight at once).
let messageIdCounter = 0;
const nextMessageId = () => {
    messageIdCounter += 1;
    return `msg-${messageIdCounter}`;
};

function Chat() {
    const { t } = useI18n();
    const messageListReference = React.createRef();
    const inputRef = useRef(null);

    const [chatMode, setChatMode] = useState(false);
    const [question, setQuestion] = useState('');
    const [messageList, setMessageList] = useState([]);

    // Suggested conversation starters for the empty state. For now clicking one
    // pre-fills the input (the backend isn't wired yet — Feature 5); later these
    // can send directly, and some become deterministic canned answers (Feature 10).
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
        };

        // Append immutably via the functional updater so concurrent/rapid
        // sends never read a stale list or overwrite each other.
        setMessageList((prev) => [...prev, userMessage, placeholder]);

        ConversationFetcher(text).then((reply) => {
            setMessageList((prev) =>
                prev.map((item) =>
                    item.id === placeholderId
                        ? { ...item, text: reply, date: new Date() }
                        : item,
                ),
            );
        });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {chatMode && (
                <div className="message-list-container">
                    <MessageList
                        referance={messageListReference}
                        className="message-list"
                        lockable
                        toBottomHeight="100%"
                        dataSource={messageList}
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
