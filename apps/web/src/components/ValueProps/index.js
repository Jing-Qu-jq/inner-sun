import React from 'react';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Card from 'react-bootstrap/Card';

const VALUES = [
    {
        icon: '🌏',
        title: 'Built for students abroad',
        body: 'Homesickness, culture shock, academic pressure, visa stress — InnerSun understands the challenges of living and studying far from home.',
    },
    {
        icon: '📚',
        title: 'Grounded in research',
        body: 'Replies are shaped by clinician-authored guidance on international-student mental health — not generic chatbot answers.',
    },
    {
        icon: '💬',
        title: 'Bilingual & always on',
        body: 'Talk in English or 简体中文, any hour of the day — whenever the feeling hits, not just during office hours.',
    },
];

const ValueProps = () => (
    <section className="section section-alt">
        <Container>
            <div className="text-center mb-5">
                <h2 className="section-title">Why InnerSun</h2>
                <p className="section-subtitle">
                    A companion that actually gets what it’s like to be an international student.
                </p>
            </div>
            <Row className="g-4">
                {VALUES.map((value) => (
                    <Col md={4} key={value.title}>
                        <Card className="value-card">
                            <Card.Body className="p-4">
                                <div className="value-icon mb-3" aria-hidden="true">
                                    {value.icon}
                                </div>
                                <Card.Title className="fw-semibold">{value.title}</Card.Title>
                                <Card.Text className="text-body-secondary">{value.body}</Card.Text>
                            </Card.Body>
                        </Card>
                    </Col>
                ))}
            </Row>
        </Container>
    </section>
);

export default ValueProps;
