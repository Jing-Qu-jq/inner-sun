import React from 'react';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';

const STEPS = [
    {
        title: 'Share what’s on your mind',
        body: 'Start a private conversation — no sign-up needed. Chat anonymously, anytime, in the language you’re most comfortable with.',
    },
    {
        title: 'We understand your world',
        body: 'InnerSun draws on guidance from researchers who study international-student wellbeing, and responds with warmth and cultural awareness.',
    },
    {
        title: 'Connect with a real counselor',
        body: 'When you’re ready, we help you reach a human counselor who understands the experience of studying far from home.',
    },
];

const HowItWorks = () => (
    <section className="section">
        <Container>
            <div className="text-center mb-5">
                <h2 className="section-title">How it works</h2>
                <p className="section-subtitle">
                    Support in three simple steps — from your first message to talking with a real person.
                </p>
            </div>
            <Row className="g-4">
                {STEPS.map((step, i) => (
                    <Col md={4} key={step.title} className="text-center">
                        <div className="step-number">{i + 1}</div>
                        <h5 className="fw-semibold">{step.title}</h5>
                        <p className="text-body-secondary mb-0">{step.body}</p>
                    </Col>
                ))}
            </Row>
        </Container>
    </section>
);

export default HowItWorks;
