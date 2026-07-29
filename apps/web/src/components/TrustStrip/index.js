import React from 'react';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import { ShieldLock, ShieldCheck, GlobeAmericas, Sunrise } from 'react-bootstrap-icons';
import IconBadge from '../IconBadge';
import { useI18n } from '../../i18n';

const TrustStrip = () => {
    const { t } = useI18n();
    const items = [
        { icon: ShieldLock, label: t('trust.t1') },
        { icon: ShieldCheck, label: t('trust.t2') },
        { icon: GlobeAmericas, label: t('trust.t3') },
        { icon: Sunrise, label: t('trust.t4') },
    ];

    return (
        <section className="bg-warm-dark text-white py-5">
            <Container>
                <Row className="g-4 justify-content-center">
                    {items.map((item) => (
                        <Col xs={6} md={3} key={item.label} className="text-center">
                            <IconBadge icon={item.icon} variant="ondark" className="mb-2" />
                            <div className="fw-medium">{item.label}</div>
                        </Col>
                    ))}
                </Row>
                <p className="text-center text-white-50 small mb-0 mt-4">{t('trust.note')}</p>
            </Container>
        </section>
    );
};

export default TrustStrip;
