import React, { useState } from 'react';

import { MessageList } from 'react-chat-elements';
import 'react-chat-elements/dist/main.css';

import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';

import paperAirplaneIcon from '../../images/paper_airplane.svg';
import ConversationFetcher from '../../fetchers/ConversationFetcher';

// Monotonic counter for stable, unique message ids so the pending
// placeholder for each send can be located and replaced independently
// (correct even when several sends are in flight at once).
let messageIdCounter = 0;
const nextMessageId = () => {
    messageIdCounter += 1;
    return `msg-${messageIdCounter}`;
};

function Chat() {
    const messageListReference = React.createRef();

    const [chatMode, setChatMode] = useState(false);
    const [question, setQuestion] = useState('');
    const [messageList, setMessageList] = useState([]);

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
            { !chatMode && (<h1 className="mt-5 mb-5 pt-5 pb-5 text-center">What can I help you with?</h1>) }
            <div className="position-relative">
                <Form.Control
                    style={{borderRadius: '25px'}}
                    type="text"
                    value={question}
                    placeholder="Message InnerSun"
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
                        alt="Send"
                    />
                </Button>
            </div>
        </div>
    );
}

export default Chat;