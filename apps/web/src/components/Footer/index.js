import React from 'react';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';

const Footer = () => (
    <footer className="bg-dark text-white py-4">
        <Container>
            <Row>
                <Col md={4}>
                    <h5>InnerSun</h5>
                    <p>AI psychological counseling assistant for international students</p>
                </Col>
                <Col md={4}>
                    <h5>Contact</h5>
                    <p>Email: contact@innersun.com</p>
                </Col>
                <Col md={4}>
                    <h5>Links</h5>
                    <ul className="list-unstyled">
                        <li><a href="/privacy" className="text-white text-decoration-none">Privacy Policy</a></li>
                        <li><a href="/terms" className="text-white text-decoration-none">Terms of Service</a></li>
                    </ul>
                </Col>
            </Row>
            <Row className="mt-3">
                <Col className="text-center">
                    <p className="mb-0">&copy; {new Date().getFullYear()} InnerSun. All rights reserved.</p>
                </Col>
            </Row>
        </Container>
    </footer>
);

export default Footer;