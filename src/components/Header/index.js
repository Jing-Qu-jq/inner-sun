import React, { useState } from 'react';
import Container from 'react-bootstrap/Container';
import Navbar from 'react-bootstrap/Navbar';
import Nav from 'react-bootstrap/Nav';
import NavDropdown from 'react-bootstrap/NavDropdown';
import Button from 'react-bootstrap/Button';
import logo from '../../images/logo.png';
import Login from '../Login';

const Header = () => {
    const [show, setShow] = useState(false);

    const handleClose = () => setShow(false);
    const handleShow = () => setShow(true);

    return (
        <>
            <Navbar expand="lg" bg="dark" data-bs-theme="dark">
                <Container>
                    <Navbar.Brand href="/">
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
                            <Nav.Link href="/">Home</Nav.Link>
                            <Nav.Link href="/chatPage">Start Chatting</Nav.Link>
                            <Nav.Link>
                                Meet Our Team
                            </Nav.Link>
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