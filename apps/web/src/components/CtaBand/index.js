import React from 'react';
import Container from 'react-bootstrap/Container';
import Button from 'react-bootstrap/Button';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';

const scrollToTeam = () => {
    document.getElementById('team')?.scrollIntoView({ behavior: 'smooth' });
};

const CtaBand = () => {
    const { t } = useI18n();
    return (
        <section className="py-4 py-lg-5">
            <Container>
                <div className="bg-sun-gradient text-white text-center p-5 rounded-4">
                    <h2 className="fw-bold mb-2">{t('cta.title')}</h2>
                    <p className="mb-4 fs-5">{t('cta.text')}</p>
                    <div className="d-flex gap-3 justify-content-center flex-wrap">
                        <Button as={Link} to="/chatPage" variant="light" size="lg" className="rounded-pill fw-semibold">
                            {t('cta.chat')}
                        </Button>
                        <Button variant="outline-light" size="lg" className="rounded-pill fw-semibold" onClick={scrollToTeam}>
                            {t('cta.human')}
                        </Button>
                    </div>
                </div>
            </Container>
        </section>
    );
};

export default CtaBand;
