import React, { useState } from 'react';

import { MessageList } from 'react-chat-elements';
import 'react-chat-elements/dist/main.css';

import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';

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
    const messageListReferance = React.createRef();

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
                        referance={messageListReferance}
                        className="message-list text-gray-darkest text-size-300 margin-bottom-4"
                        lockable
                        toBottomHeight="100%"
                        dataSource={messageList}
                    />
                </div>
            )}
            <div className="position-relative">
                <h1>What can I help you with?</h1>
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
            <div className="d-flex justify-content-end mt-5 gap-2">
                <Button
                    variant="secondary"
                >
                    Talk to a real person
                </Button>
                <Button
                    variant="secondary"
                >
                    placeholder
                </Button>
                <Button
                    variant="secondary"
                >
                    placeholder
                </Button>
            </div>
        </>
    );
}

export default Chat;