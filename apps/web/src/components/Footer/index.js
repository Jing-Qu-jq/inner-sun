import React from 'react';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import { useI18n } from '../../i18n';

const Footer = () => {
    const { t } = useI18n();
    return (
        <footer className="bg-warm-dark text-white py-4">
            <Container>
                <Row>
                    <Col md={4}>
                        <h5>InnerSun</h5>
                        <p>{t('footer.tagline')}</p>
                    </Col>
                    <Col md={4}>
                        <h5>{t('footer.contact')}</h5>
                        <p>{t('footer.emailLabel')}: contact@innersun.com</p>
                    </Col>
                    <Col md={4}>
                        <h5>{t('footer.links')}</h5>
                        <ul className="list-unstyled">
                            <li><a href="/privacy" className="text-white text-decoration-none">{t('footer.privacy')}</a></li>
                            <li><a href="/terms" className="text-white text-decoration-none">{t('footer.terms')}</a></li>
                        </ul>
                    </Col>
                </Row>
                <Row className="mt-3">
                    <Col className="text-center">
                        <p className="mb-0">&copy; {new Date().getFullYear()} InnerSun. {t('footer.rights')}</p>
                    </Col>
                </Row>
            </Container>
        </footer>
    );
};

export default Footer;
