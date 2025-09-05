import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';

function Login({
    show,
    handleClose,
}) {

    return (
        <>
            <Modal show={show} onHide={handleClose}>
                <Modal.Body>
                    <div className="text-center h4 m-4">Log in</div>
                    <Form>
                        <Form.Group className="mb-3" controlId="formPlaintextEmail">
                            <Form.Control type="email" placeholder="Email" />
                        </Form.Group>

                        <Form.Group className="mb-3" controlId="formPlaintextPassword">
                            <Form.Control type="password" placeholder="Password" />
                        </Form.Group>

                        <Form.Check
                            className="small"
                            type="checkbox"
                            id="default-checkbox"
                            label="Remember me"
                        />
                    </Form>
                    <div className='vstack'>
                        <Button
                            className="mb-4 mt-4"
                            variant="primary"
                            onClick={handleClose}
                        >
                            Log in
                        </Button>
                    </div>
                </Modal.Body>
            </Modal>
        </>
    );
}

export default Login;