// Shared vocabulary for the whole platform. The client receives this via /api/bootstrap.
export const STATUSES = [
  { key: 'requested', label: 'Looking for carrier', short: 'Requested' },
  { key: 'accepted', label: 'Carrier assigned', short: 'Assigned' },
  { key: 'en_route_pickup', label: 'Driver on the way to pickup', short: 'To pickup' },
  { key: 'at_pickup', label: 'Loading at pickup', short: 'Loading' },
  { key: 'in_transit', label: 'On the road', short: 'In transit' },
  { key: 'at_delivery', label: 'Unloading at destination', short: 'Unloading' },
  { key: 'delivered', label: 'Delivered', short: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled', short: 'Cancelled' },
];

export const ACTIVE = ['accepted', 'en_route_pickup', 'at_pickup', 'in_transit', 'at_delivery'];
export const MOVING = ['en_route_pickup', 'in_transit'];

// Inspection photos. The same slots are taken at pickup and at delivery so they can be compared side by side.
export const PHOTO_SLOTS = [
  { key: 'trailer_front', label: 'Trailer — front', hint: 'Stand back so the whole front is in the picture.', required: true },
  { key: 'trailer_left', label: 'Trailer — left side', hint: 'Walk along the driver side.', required: true },
  { key: 'trailer_right', label: 'Trailer — right side', hint: 'Walk along the passenger side.', required: true },
  { key: 'trailer_rear', label: 'Trailer — rear doors', hint: 'Doors closed, number plate visible.', required: true },
  { key: 'cargo', label: 'The load inside', hint: 'Open the doors and show how the load is secured.', required: true },
  { key: 'seal', label: 'Seal / lock', hint: 'Close up, so the seal number can be read.', required: true },
  { key: 'paperwork', label: 'Paperwork (BOL)', hint: 'Bill of lading or delivery receipt.', required: false },
];

export const DAMAGE_SLOT = { key: 'damage', label: 'Damage', hint: 'Show any damage up close.', required: false };
