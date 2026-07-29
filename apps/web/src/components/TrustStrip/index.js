import React from 'react';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';

const ITEMS = [
    { emoji: '🔒', label: 'Private & anonymous' },
    { emoji: '🛡️', label: 'Your data, your control' },
    { emoji: '🌐', label: 'English · 简体中文' },
    { emoji: '⚕️', label: 'Not a medical device' },
];

const TrustStrip = () => (
    <section className="trust-strip py-4">
        <Container>
            <Row className="align-items-center g-3">
                {ITEMS.map((item) => (
                    <Col xs={6} md={3} key={item.label}>
                        <div className="trust-item">
                            <span className="trust-emoji" aria-hidden="true">
                                {item.emoji}
                            </span>
                            <span className="fw-medium">{item.label}</span>
                        </div>
                    </Col>
                ))}
            </Row>
            <p className="text-center text-white-50 small mb-0 mt-3">
                InnerSun offers emotional support, not emergency care. If you’re in crisis,
                please contact your local emergency services or a crisis hotline right away.
            </p>
        </Container>
    </section>
);

export default TrustStrip;
