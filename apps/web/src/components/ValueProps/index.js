import React from 'react';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Card from 'react-bootstrap/Card';
import { GlobeAmericas, Mortarboard, ChatHeart } from 'react-bootstrap-icons';
import IconBadge from '../IconBadge';
import { useI18n } from '../../i18n';

const ValueProps = () => {
    const { t } = useI18n();
    const values = [
        { icon: GlobeAmericas, title: t('why.v1.title'), body: t('why.v1.body') },
        { icon: Mortarboard, title: t('why.v2.title'), body: t('why.v2.body') },
        { icon: ChatHeart, title: t('why.v3.title'), body: t('why.v3.body') },
    ];

    return (
        <section className="py-5 bg-cream">
            <Container>
                <div className="text-center mb-5">
                    <h2 className="fw-bold">{t('why.title')}</h2>
                    <p className="text-secondary mx-auto mb-0" style={{ maxWidth: '660px' }}>
                        {t('why.subtitle')}
                    </p>
                </div>
                <Row className="g-4">
                    {values.map((value) => (
                        <Col md={4} key={value.title}>
                            <Card className="h-100 border-0 rounded-4 shadow-sm hover-lift">
                                <Card.Body className="p-4">
                                    <IconBadge icon={value.icon} variant="sun" className="mb-3" />
                                    <Card.Title className="fw-semibold">{value.title}</Card.Title>
                                    <Card.Text className="text-secondary">{value.body}</Card.Text>
                                </Card.Body>
                            </Card>
                        </Col>
                    ))}
                </Row>
            </Container>
        </section>
    );
};

export default ValueProps;
