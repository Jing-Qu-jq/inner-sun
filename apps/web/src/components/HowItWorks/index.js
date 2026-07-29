import React from 'react';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import { useI18n } from '../../i18n';

const HowItWorks = () => {
    const { t } = useI18n();
    const steps = [
        { title: t('how.s1.title'), body: t('how.s1.body') },
        { title: t('how.s2.title'), body: t('how.s2.body') },
        { title: t('how.s3.title'), body: t('how.s3.body') },
    ];

    return (
        <section className="py-5">
            <Container>
                <div className="text-center mb-5">
                    <h2 className="fw-bold">{t('how.title')}</h2>
                    <p className="text-secondary mx-auto mb-0" style={{ maxWidth: '660px' }}>
                        {t('how.subtitle')}
                    </p>
                </div>
                <Row className="g-4">
                    {steps.map((step, i) => (
                        <Col md={4} key={step.title} className="text-center">
                            <span className="icon-badge icon-badge-gradient fs-4 fw-bold mb-3">
                                {i + 1}
                            </span>
                            <h5 className="fw-semibold">{step.title}</h5>
                            <p className="text-secondary mb-0">{step.body}</p>
                        </Col>
                    ))}
                </Row>
            </Container>
        </section>
    );
};

export default HowItWorks;
