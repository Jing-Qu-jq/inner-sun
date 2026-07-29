import React from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { geoEqualEarth } from 'd3-geo';
import worldData from 'world-atlas/countries-110m.json';
import { useI18n } from '../../i18n';

// Countries to "light up". Add an entry here to highlight another country as
// InnerSun expands — keyed by the world-atlas `properties.name`.
const HIGHLIGHTED = {
    'United States of America': { coordinates: [-98, 39], labelKey: 'map.node.us', flag: '🇺🇸' },
    China: { coordinates: [104, 35.5], labelKey: 'map.node.cn', flag: '🇨🇳' },
};

// Keep these in sync with <ComposableMap> below so the hand-drawn arc lines up
// with the projected country markers.
const WIDTH = 800;
const HEIGHT = 440;
const PROJECTION = geoEqualEarth()
    .scale(150)
    .center([10, 25])
    .translate([WIDTH / 2, HEIGHT / 2]);

const SUN = '#ff9a4d';
const LAND = '#e7ded1';
const LAND_STROKE = '#d8ccb8';

const ConnectionMap = () => {
    const { t } = useI18n();
    const nodes = Object.values(HIGHLIGHTED);

    // A gentle quadratic arc between the two points that stays on the map
    // (a true geodesic would wrap over the pole and off the top edge).
    const [ux, uy] = PROJECTION(HIGHLIGHTED['United States of America'].coordinates);
    const [cx, cy] = PROJECTION(HIGHLIGHTED.China.coordinates);
    const ctrlX = (ux + cx) / 2;
    const ctrlY = Math.min(uy, cy) - 120;
    const arc = `M ${ux} ${uy} Q ${ctrlX} ${ctrlY} ${cx} ${cy}`;

    return (
        <div className="mx-auto" style={{ maxWidth: '960px' }}>
            <ComposableMap
                width={WIDTH}
                height={HEIGHT}
                projection="geoEqualEarth"
                projectionConfig={{ scale: 150, center: [10, 25] }}
                style={{ width: '100%', height: 'auto' }}
                aria-label="A world map with the United States and China highlighted and connected, representing the bridge between where international students study and home."
                role="img"
            >
                <Geographies geography={worldData}>
                    {({ geographies }) =>
                        geographies.map((geo) => {
                            const highlighted = HIGHLIGHTED[geo.properties.name];
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

                {nodes.map((node) => (
                    <Marker key={node.labelKey} coordinates={node.coordinates}>
                        <circle r={11} className="map-node-halo" fill={SUN} />
                        <circle r={5} fill={SUN} stroke="#fff" strokeWidth={1.5} />
                        <text
                            textAnchor="middle"
                            y={-16}
                            style={{ fontFamily: 'inherit', fontWeight: 600, fill: '#2b2622' }}
                            fontSize={13}
                        >
                            {node.flag} {t(node.labelKey)}
                        </text>
                    </Marker>
                ))}
            </ComposableMap>
        </div>
    );
};

export default ConnectionMap;
