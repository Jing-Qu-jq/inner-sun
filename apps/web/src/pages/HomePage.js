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
import { useI18n } from '../i18n';

const scrollToTeam = () => {
    document.getElementById('team')?.scrollIntoView({ behavior: 'smooth' });
};

const HomePage = () => {
    const { t } = useI18n();
    const location = useLocation();

    // Support deep-linking to a section from another route (e.g. the header's
    // "Meet Our Team" link while on the chat page navigates here with state).
    useEffect(() => {
        const target = location.state?.scrollTo;
        if (target) {
            const id = window.setTimeout(() => {
                document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' });
            }, 0);
            return () => window.clearTimeout(id);
        }
        return undefined;
    }, [location]);

    return (
        <>
            <div className="position-relative">
                <Image src={heroImage} className="hero-image w-100" alt="" />
                <div className="hero-overlay" />
                <div className="hero-content position-absolute top-50 start-50 translate-middle w-100 text-white text-center px-3" style={{ maxWidth: '780px', zIndex: 1 }}>
                    <h1>{t('hero.title')}</h1>
                    <p className="hero-lead">{t('hero.lead')}</p>
                    <div className="d-flex gap-3 justify-content-center flex-wrap mt-4">
                        <Button as={Link} to="/chatPage" variant="primary" className="rounded-pill fw-semibold px-4 text-nowrap" size="lg">
                            {t('hero.ctaChat')}
                        </Button>
                        <Button variant="outline-light" className="rounded-pill fw-semibold px-4 text-nowrap" size="lg" onClick={scrollToTeam}>
                            {t('hero.ctaCounselors')}
                        </Button>
                    </div>
                </div>
            </div>

            <HowItWorks />

            <ValueProps />

            <section className="py-4 py-lg-5">
                <Container>
                    <div className="text-center">
                        <h2 className="fw-bold">{t('map.title')}</h2>
                        <p className="text-secondary mx-auto mb-0" style={{ maxWidth: '660px' }}>
                            {t('map.subtitle')}
                        </p>
                    </div>
                    <ConnectionMap />
                </Container>
            </section>

            <TrustStrip />

            <section id="team" className="py-4 py-lg-5 bg-cream">
                <Container>
                    <div className="text-center mb-4">
                        <h2 className="fw-bold">{t('team.title')}</h2>
                        <p className="text-secondary mx-auto mb-0" style={{ maxWidth: '660px' }}>
                            {t('team.sample')}
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
