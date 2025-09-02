import React from 'react';
import Container from 'react-bootstrap/Container';
import Image from 'react-bootstrap/Image';
import heroImage from '../images/hero_image.png';

const HomePage = () => (
    <Container className="p-5 text-white">
        <Image src={heroImage} className="hero-image"/>
        <h1>AI psychological counseling assistant, designed specifically for international students</h1>
        <p>Anonymous, secure, available anytime, anywhere</p>
    </Container>
);

export default HomePage;