import React, { useEffect } from 'react';
import '@splidejs/react-splide/css';
import Container from 'react-bootstrap/Container';
import Image from 'react-bootstrap/Image';
import Button from 'react-bootstrap/Button';
import { Splide, SplideSlide } from '@splidejs/react-splide';
import { Link, useLocation } from 'react-router-dom';
import heroImage from '../images/hero_image.png';
import teamData from '../team.json';
import TeamCard from '../components/TeamCard';
import HowItWorks from '../components/HowItWorks';
import ValueProps from '../components/ValueProps';
import ConnectionMap from '../components/ConnectionMap';
import TrustStrip from '../components/TrustStrip';
import CtaBand from '../components/CtaBand';

const scrollToTeam = () => {
    document.getElementById('team')?.scrollIntoView({ behavior: 'smooth' });
};

const HomePage = () => {
    const location = useLocation();

    // Support deep-linking to a section from another route (e.g. the header's
    // "Meet Our Team" link while on the chat page navigates here with state).
    useEffect(() => {
        const target = location.state?.scrollTo;
        if (target) {
            // Wait a tick so the section has mounted before scrolling.
            const id = window.setTimeout(() => {
                document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' });
            }, 0);
            return () => window.clearTimeout(id);
        }
        return undefined;
    }, [location]);

    return (
        <>
            <div className="hero-section position-relative">
                <Image src={heroImage} className="hero-image w-100" alt="" />
                <div className="hero-overlay" />
                <div className="hero-content position-absolute top-50 start-50 translate-middle text-white text-center">
                    <h1>You’re not alone — wherever home is</h1>
                    <p className="hero-lead">
                        Warm, culturally-aware emotional support for international students.
                        Anonymous, secure, and here whenever you need it — in English or 中文.
                    </p>
                    <div className="hero-cta d-flex gap-3 justify-content-center flex-wrap mt-4">
                        <Button as={Link} to="/chatPage" variant="primary" size="lg">
                            Start chatting
                        </Button>
                        <Button variant="outline-light" size="lg" onClick={scrollToTeam}>
                            Meet our counselors
                        </Button>
                    </div>
                </div>
            </div>

            <HowItWorks />

            <ValueProps />

            <section className="section">
                <Container>
                    <div className="text-center mb-5">
                        <h2 className="section-title">Bridging home and here</h2>
                        <p className="section-subtitle">
                            From campuses across the U.S. to families back in China and beyond —
                            InnerSun keeps you connected to support that feels like home.
                        </p>
                    </div>
                    <ConnectionMap />
                </Container>
            </section>

            <TrustStrip />

            <section id="team" className="section section-alt">
                <Container>
                    <div className="text-center mb-4">
                        <h2 className="section-title">Meet Our Team</h2>
                        <p className="section-subtitle mb-0">
                            Sample content — placeholder profiles and photos shown for preview.
                            Real team members are coming soon.
                        </p>
                    </div>
                    <Splide
                        options={{
                            rewind: true,
                            perPage: 4,
                            breakpoints: {
                                1200: { perPage: 3 },
                                768: { perPage: 2 },
                                480: { perPage: 1 },
                            },
                        }}
                    >
                        {teamData.map((member) => (
                            <SplideSlide key={member.name}>
                                <TeamCard member={member} />
                            </SplideSlide>
                        ))}
                    </Splide>
                </Container>
            </section>

            <CtaBand />
        </>
    );
};

export default HomePage;
