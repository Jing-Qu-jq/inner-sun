import React, { useState } from 'react';
import Container from 'react-bootstrap/Container';
import Navbar from 'react-bootstrap/Navbar';
import Nav from 'react-bootstrap/Nav';
import NavDropdown from 'react-bootstrap/NavDropdown';
import Button from 'react-bootstrap/Button';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import logo from '../../images/logo.png';
import Login from '../Login';

const Header = () => {
    const [show, setShow] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

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
            <Navbar expand="lg" bg="dark" data-bs-theme="dark">
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
                            <Nav.Link as={Link} to="/">Home</Nav.Link>
                            <Nav.Link as={Link} to="/chatPage">Start Chatting</Nav.Link>
                            <Nav.Link href="/" onClick={handleTeamClick}>Meet Our Team</Nav.Link>
                            <NavDropdown title="Language" id="basic-nav-dropdown">
                                <NavDropdown.Item href="#action/3.1">
                                    English
                                </NavDropdown.Item>
                                <NavDropdown.Item href="#action/3.2">
                                    简体中文
                                </NavDropdown.Item>
                            </NavDropdown>
                        </Nav>
                        <Button
                            variant="light"
                            onClick={handleShow}
                        >
                            Login
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