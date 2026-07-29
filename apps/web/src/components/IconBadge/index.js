import React from 'react';

// A circular badge holding a line icon. `variant` picks the color treatment:
//   sun      — pale amber badge, orange icon (on light backgrounds)
//   ondark   — translucent badge, warm icon (on dark backgrounds)
//   gradient — filled sun gradient, white icon
const IconBadge = ({ icon: Icon, size = 28, variant = 'sun', className = '' }) => (
    <span className={`icon-badge icon-badge-${variant} ${className}`} aria-hidden="true">
        <Icon size={size} />
    </span>
);

export default IconBadge;
