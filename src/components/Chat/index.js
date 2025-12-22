import React, { useState } from 'react';

import { MessageList } from 'react-chat-elements';
import 'react-chat-elements/dist/main.css';

import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Card from 'react-bootstrap/Card';

import paperAirplaneIcon from '../../images/paper_airplane.svg';
import ConversationFetcher from '../../fetchers/ConversationFetcher';

function Chat({
    listingId,
}) {
    const messageListReference = React.createRef();

    const [chatMode, setChatMode] = useState(false);
    const [question, setQuestion] = useState('');
    const [messageList, setMessageList] = useState([]);

    const sendQuestion = () => {
        setChatMode(true);
        setQuestion('');
        const message = {
            position: 'right',
            type: 'text',
            date: new Date(),
            text: question,
        };
        messageList.push(message);
        setMessageList(messageList);
        const answer = {
            position: 'left',
            type: 'text',
            text: '...',
        };
        setMessageList([...messageList, answer]);

        ConversationFetcher(question).then((reply) => {
            setMessageList([...messageList, {
                ...answer,
                text: reply,
                date: new Date(),
            }]);
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
            {!chatMode && (
                <div className="mt-5">
                    <Card>
                        <Card.Body>This is some text within a card body.</Card.Body>
                    </Card>
                </div>
            )}
        </div>
    );
}

export default Chat;