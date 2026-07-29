import React, { useState } from 'react';
import Container from 'react-bootstrap/Container';
import Navbar from 'react-bootstrap/Navbar';
import Nav from 'react-bootstrap/Nav';
import NavDropdown from 'react-bootstrap/NavDropdown';
import Button from 'react-bootstrap/Button';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import logo from '../../images/logo.png';
import Login from '../Login';
import { useI18n, AVAILABLE_LOCALES } from '../../i18n';

const Header = () => {
    const [show, setShow] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const { t, locale, setLocale } = useI18n();

    const handleClose = () => setShow(false);
    const handleShow = () => setShow(true);

    // "Meet Our Team" scrolls to the team section on the home page. From any
    // other route, navigate home first and let HomePage handle the scroll.
    const handleTeamClick = (e) => {
        e.preventDefault();
        if (location.pathname === '/') {
            document.getElementById('team')?.scrollIntoView({ behavior: 'smooth' });
        } else {
            navigate('/', { state: { scrollTo: 'team' } });
        }
    };

    return (
        <>
            <Navbar expand="lg" data-bs-theme="dark" className="bg-warm-dark">
                <Container>
                    <Navbar.Brand as={Link} to="/">
                        <img
                            alt=""
                            src={logo}
                            width="30"
                            className="d-inline-block"
                        />
                        {' '}
                        InnerSun
                    </Navbar.Brand>
                    <Navbar.Toggle aria-controls="basic-navbar-nav"/>
                    <Navbar.Collapse id="basic-navbar-nav">
                        <Nav className="w-100 d-flex justify-content-evenly">
                            <Nav.Link as={Link} to="/">{t('nav.home')}</Nav.Link>
                            <Nav.Link as={Link} to="/chatPage">{t('nav.startChatting')}</Nav.Link>
                            <Nav.Link href="/" onClick={handleTeamClick}>{t('nav.meetTeam')}</Nav.Link>
                            <NavDropdown title={t('nav.language')} id="basic-nav-dropdown">
                                {AVAILABLE_LOCALES.map((option) => (
                                    <NavDropdown.Item
                                        key={option.code}
                                        active={locale === option.code}
                                        onClick={() => setLocale(option.code)}
                                    >
                                        {option.label}
                                    </NavDropdown.Item>
                                ))}
                            </NavDropdown>
                        </Nav>
                        <Button
                            variant="light"
                            className="text-nowrap"
                            onClick={handleShow}
                        >
                            {t('nav.login')}
                        </Button>
                    </Navbar.Collapse>
                </Container>
            </Navbar>
            <Login
                show={show}
                handleClose={handleClose}
            />
        </>
    );
}

export default Header;
