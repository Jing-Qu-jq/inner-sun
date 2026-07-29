import React from 'react';
import Container from 'react-bootstrap/Container';
import Button from 'react-bootstrap/Button';
import { Link } from 'react-router-dom';

const scrollToTeam = () => {
    document.getElementById('team')?.scrollIntoView({ behavior: 'smooth' });
};

const CtaBand = () => (
    <section className="section">
        <Container>
            <div className="cta-band text-center p-5">
                <h2 className="fw-bold mb-2">Ready to talk?</h2>
                <p className="mb-4 fs-5">It’s free to start, and completely anonymous.</p>
                <div className="d-flex gap-3 justify-content-center flex-wrap">
                    <Button as={Link} to="/chatPage" variant="light" size="lg">
                        Start chatting
                    </Button>
                    <Button variant="outline-light" size="lg" onClick={scrollToTeam}>
                        Talk to a human
                    </Button>
                </div>
            </div>
        </Container>
    </section>
);

export default CtaBand;
