import React from 'react';
import Card from 'react-bootstrap/Card';
import profileImage from '../../images/profile_image.png';

const TeamCard = ({ member }) => (
    <Card style={{ width: '18rem' }}>
        <Card.Img
            variant="top"
            src={profileImage}
            alt={member.name}
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