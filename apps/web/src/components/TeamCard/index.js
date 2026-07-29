import React from 'react';
import Card from 'react-bootstrap/Card';
import Badge from 'react-bootstrap/Badge';
import profileImage from '../../images/profile_image.png';

const TeamCard = ({ member }) => (
    <Card style={{ width: '18rem' }} className="position-relative">
        <Badge bg="secondary" className="position-absolute top-0 end-0 m-2">
            Sample
        </Badge>
        <Card.Img
            variant="top"
            src={profileImage}
            alt={`Placeholder profile photo for ${member.name} (sample)`}
        />
        <Card.Body>
            <Card.Title>{member.name}</Card.Title>
            <Card.Subtitle className="mb-2 text-muted">
                {member.title}
            </Card.Subtitle>
            <Card.Text>
                {member.specialization}
            </Card.Text>
        </Card.Body>
    </Card>
);

export default TeamCard;