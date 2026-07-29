import React from 'react';

// The great-circle-ish arc connecting the two points. Shared by the drawn
// line and the traveling pulse so they follow exactly the same path.
const ARC_PATH = 'M 215 205 C 400 35 560 25 705 170';
const US = { x: 215, y: 205 };
const CN = { x: 705, y: 170 };

// A faint dot field for map-like texture, generated once at module load.
const DOTS = [];
for (let y = 45; y <= 335; y += 24) {
    for (let x = 40; x <= 880; x += 24) {
        DOTS.push({ x, y });
    }
}

const ConnectionMap = () => (
    <svg
        className="connection-map"
        viewBox="0 0 920 380"
        role="img"
        aria-label="A map connecting the United States and China, representing the bridge between where international students study and home."
    >
        <defs>
            <linearGradient id="arcGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#ff9a4d" />
                <stop offset="100%" stopColor="#ffd28a" />
            </linearGradient>
            <radialGradient id="nodeGradient" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffd28a" />
                <stop offset="100%" stopColor="#ff9a4d" />
            </radialGradient>
        </defs>

        {/* dotted texture */}
        <g fill="#d7d2c8" opacity="0.5">
            {DOTS.map((d) => (
                <circle key={`${d.x}-${d.y}`} cx={d.x} cy={d.y} r="1.6" />
            ))}
        </g>

        {/* abstract landmasses behind each node */}
        <ellipse cx={US.x} cy={US.y} rx="120" ry="74" fill="#e9c9a3" opacity="0.35" />
        <ellipse cx={CN.x} cy={CN.y} rx="132" ry="80" fill="#e9c9a3" opacity="0.35" />

        {/* connection arc */}
        <path
            className="map-arc"
            d={ARC_PATH}
            fill="none"
            stroke="url(#arcGradient)"
            strokeWidth="3"
            strokeLinecap="round"
        />

        {/* pulse traveling from home to campus */}
        <circle r="5" fill="#ff8c42">
            <animateMotion dur="6s" repeatCount="indefinite" path={ARC_PATH} />
        </circle>

        {/* nodes */}
        {[US, CN].map((n, i) => (
            <g key={i}>
                <circle
                    className="map-node-halo"
                    cx={n.x}
                    cy={n.y}
                    r="16"
                    fill="#ff9a4d"
                />
                <circle cx={n.x} cy={n.y} r="9" fill="url(#nodeGradient)" stroke="#fff" strokeWidth="2" />
            </g>
        ))}

        {/* labels */}
        <text x={US.x} y={US.y + 46} textAnchor="middle" fontSize="18" fill="#2b2d42" fontWeight="600">
            🇺🇸 United States
        </text>
        <text x={CN.x} y={CN.y + 46} textAnchor="middle" fontSize="18" fill="#2b2d42" fontWeight="600">
            🇨🇳 中国 · China
        </text>
    </svg>
);

export default ConnectionMap;
