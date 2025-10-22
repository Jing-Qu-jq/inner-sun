import Container from 'react-bootstrap/Container';
import Chat from "../components/Chat";

const ChatPage = () => {
    return (
        <Container className="p-5" style={{ height: '90vh', maxWidth: '1000px' }}>
            <Chat />
        </Container>
    );
};

export default ChatPage;