import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';
import { useI18n } from '../../i18n';

function Login({
    show,
    handleClose,
}) {
    const { t } = useI18n();

    return (
        <>
            <Modal show={show} onHide={handleClose}>
                <Modal.Body>
                    <div className="text-center h4 m-4">{t('login.title')}</div>
                    <Form>
                        <Form.Group className="mb-3" controlId="formPlaintextEmail">
                            <Form.Control type="email" placeholder={t('login.email')} />
                        </Form.Group>

                        <Form.Group className="mb-3" controlId="formPlaintextPassword">
                            <Form.Control type="password" placeholder={t('login.password')} />
                        </Form.Group>

                        <Form.Check
                            className="small"
                            type="checkbox"
                            id="default-checkbox"
                            label={t('login.remember')}
                        />
                    </Form>
                    <div className='vstack'>
                        <Button
                            className="mb-4 mt-4"
                            variant="primary"
                            onClick={handleClose}
                        >
                            {t('login.submit')}
                        </Button>
                    </div>
                </Modal.Body>
            </Modal>
        </>
    );
}

export default Login;
