import React from 'react';
import '@splidejs/react-splide/css';
import Container from 'react-bootstrap/Container';
import Image from 'react-bootstrap/Image';
import { Splide, SplideSlide } from '@splidejs/react-splide';
import heroImage from '../images/hero_image.png';
import teamData from '../team.json';
import TeamCard from '../components/TeamCard';

const HomePage = () => (
    <Container fluid className="px-0">
        <div className="hero-section position-relative">
            <Image src={heroImage} className="hero-image w-100"/>
            <div className="hero-content position-absolute top-50 start-50 translate-middle text-white text-center">
                <h1>AI psychological counseling assistant, designed specifically for international students</h1>
                <p>Anonymous, secure, available anytime, anywhere</p>
            </div>
        </div>
        <div className="team-section py-5">
            <Splide
                options={{
                    rewind: true,
                    perPage: 4,
                    breakpoints: {
                        1200: {
                            perPage: 3,
                        },
                        768: {
                            perPage: 2,
                        },
                        480: {
                            perPage: 1,
                        }
                    }
                }}
            >
                {teamData.map((member) => (
                    <SplideSlide key={member.name}>
                        <TeamCard member={member}/>
                    </SplideSlide>
                ))}
            </Splide>
        </div>
    </Container>
);

export default HomePage;