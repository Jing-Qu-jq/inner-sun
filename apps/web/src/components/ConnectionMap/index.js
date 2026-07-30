import React from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { geoEqualEarth } from 'd3-geo';
import worldData from 'world-atlas/countries-110m.json';

// Countries to "light up", keyed by the world-atlas `properties.name`.
// Add a name here to highlight another country as InnerSun expands.
const HIGHLIGHTED = new Set(['United States of America', 'China', 'Taiwan']);

// Arc endpoints (the "bridge"), as [longitude, latitude].
const US = [-98, 39];
const CN = [104, 35.5];

// Keep these in sync with <ComposableMap> below so the hand-drawn arc lines up
// with the projected country markers. The frame is cropped fairly tight around
// the inhabited latitudes to avoid empty "sky"/ocean padding above and below.
const WIDTH = 800;
const HEIGHT = 300;
const CENTER = [10, 32];
const SCALE = 152;
const PROJECTION = geoEqualEarth()
    .scale(SCALE)
    .center(CENTER)
    .translate([WIDTH / 2, HEIGHT / 2]);

const SUN = '#ff9a4d';
const LAND = '#e7ded1';
const LAND_STROKE = '#d8ccb8';

const ConnectionMap = () => {
    // A gentle quadratic arc between the two points that stays on the map
    // (a true geodesic would wrap over the pole and off the top edge).
    const [ux, uy] = PROJECTION(US);
    const [cx, cy] = PROJECTION(CN);
    const ctrlX = (ux + cx) / 2;
    const ctrlY = Math.min(uy, cy) - 80;
    const arc = `M ${ux} ${uy} Q ${ctrlX} ${ctrlY} ${cx} ${cy}`;

    return (
        <div className="mx-auto">
            <ComposableMap
                width={WIDTH}
                height={HEIGHT}
                projection="geoEqualEarth"
                projectionConfig={{ scale: SCALE, center: CENTER }}
                style={{ width: '100%', height: 'auto' }}
                aria-label="A world map with the United States, China and Taiwan highlighted, connected by an arc — representing the bridge between where international students study and home."
                role="img"
            >
                <Geographies geography={worldData}>
                    {({ geographies }) =>
                        geographies.map((geo) => {
                            const highlighted = HIGHLIGHTED.has(geo.properties.name);
                            return (
                                <Geography
                                    key={geo.rsmKey}
                                    geography={geo}
                                    fill={highlighted ? SUN : LAND}
                                    stroke={highlighted ? '#f2892f' : LAND_STROKE}
                                    strokeWidth={0.4}
                                    style={{
                                        default: { outline: 'none' },
                                        hover: { outline: 'none', fill: highlighted ? '#f2892f' : '#ded4c4' },
                                        pressed: { outline: 'none' },
                                    }}
                                />
                            );
                        })
                    }
                </Geographies>

                {/* connection arc + a pulse travelling from home to campus */}
                <path className="map-arc" d={arc} fill="none" stroke={SUN} strokeWidth={2.5} strokeLinecap="round" />
                <circle r={4.5} fill="#ff8c42">
                    <animateMotion dur="6s" repeatCount="indefinite" path={arc} />
                </circle>
            </ComposableMap>
        </div>
    );
};

export default ConnectionMap;
