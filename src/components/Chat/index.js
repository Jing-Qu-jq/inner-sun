import React, { useState } from 'react';

import { MessageList } from 'react-chat-elements';
import 'react-chat-elements/dist/main.css';

import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Card from 'react-bootstrap/Card';

import paperAirplaneIcon from '../../images/paper_airplane.svg';

const fetchSummary = async (listingId) => {
    try {
        const response = await fetch('https://qno3ci0y20.execute-api.us-east-1.amazonaws.com/vehicle-summary?listingId=' + listingId);
        const json = await response.json();
        return json?.summary;
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        return '';
    }
};

const fetchAnswer = async (listingId, question, summary) => {
    try {
        const response = await fetch('https://qno3ci0y20.execute-api.us-east-1.amazonaws.com/vehicle-summary/id/' + listingId, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: question,
                summary,
            }),
        });
        const json = await response.json();
        return json?.response;
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        return '';
    }
};

function Chat({
    emailCTAProps,
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
        fetchAnswer(listingId, question).then((data) => {
            setMessageList([...messageList, {
                ...answer,
                text: data,
                date: new Date(),
            }]);
        });
    };

    return (
        <>
            {chatMode && (
                <div style={{
                    maxHeight: '300px',
                    overflowY: 'auto',
                    marginBottom: '1rem',
                }}
                >
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
                    className="mt-3"
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
            <div className="mt-5">
                <Card>
                    <Card.Body>This is some text within a card body.</Card.Body>
                </Card>
            </div>
        </>
    );
}

export default Chat;