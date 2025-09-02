import { Outlet } from 'react-router-dom';
import Nav from 'react-bootstrap/Nav';
import Container from 'react-bootstrap/Container';
import Navbar from 'react-bootstrap/Navbar';
import NavDropdown from 'react-bootstrap/NavDropdown';
import Button from 'react-bootstrap/Button';
import logo from '../images/logo.png';

const Layout = () => {
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
                                <NavDropdown.Item href="#action/3.1">Action</NavDropdown.Item>
                                <NavDropdown.Item href="#action/3.2">
                                    Another action
                                </NavDropdown.Item>
                                <NavDropdown.Item href="#action/3.3">Something</NavDropdown.Item>
                                <NavDropdown.Divider/>
                                <NavDropdown.Item href="#action/3.4">
                                    Separated link
                                </NavDropdown.Item>
                            </NavDropdown>
                        </Nav>
                        <Button variant="light">Login</Button>
                    </Navbar.Collapse>
                </Container>
            </Navbar>

            <Outlet />
        </>
    )
};

export default Layout;