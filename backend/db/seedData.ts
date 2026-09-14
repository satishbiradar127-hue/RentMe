import {
  User,
  Profile,
  Companion,
  Experience,
  Availability,
  Booking,
  BookingEvent,
  AuditLog
} from '../models';

export const SEED_TIMESTAMP = '2026-09-10T12:00:00.000Z';

export const seedUsers: readonly User[] = [
  { id: 'user-rohan', email: 'rohan@example.com', role: 'customer', name: 'Rohan Mehta', phone: '+91 98765 43210', createdAt: SEED_TIMESTAMP, updatedAt: SEED_TIMESTAMP },
  { id: 'user-nisha', email: 'nisha@example.com', role: 'customer', name: 'Nisha Rao', phone: '+91 98765 43211', createdAt: SEED_TIMESTAMP, updatedAt: SEED_TIMESTAMP },
  { id: 'user-aisha', email: 'aisha@rentme.local', role: 'companion', name: 'Aisha Khan', phone: '+91 98765 43212', createdAt: SEED_TIMESTAMP, updatedAt: SEED_TIMESTAMP },
  { id: 'user-arjun', email: 'arjun@rentme.local', role: 'companion', name: 'Arjun Reddy', phone: '+91 98765 43213', createdAt: SEED_TIMESTAMP, updatedAt: SEED_TIMESTAMP },
  { id: 'user-meera', email: 'meera@rentme.local', role: 'companion', name: 'Meera Iyer', phone: '+91 98765 43214', createdAt: SEED_TIMESTAMP, updatedAt: SEED_TIMESTAMP },
  { id: 'user-admin', email: 'admin@rentme.local', role: 'admin', name: 'RentMe Ops Admin', phone: '+91 98765 43215', createdAt: SEED_TIMESTAMP, updatedAt: SEED_TIMESTAMP }
];

export const seedProfiles: readonly Profile[] = seedUsers.map((u) => ({
  id: `prof-${u.id}`,
  userId: u.id,
  displayName: u.name,
  city: 'Hyderabad, Telangana',
  idVerified: true,
  verificationStatus: 'verified',
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP
}));

export const seedCompanions: readonly Companion[] = [
  {
    id: 'aisha',
    userId: 'user-aisha',
    name: 'Aisha Khan',
    city: 'Hyderabad, Telangana',
    category: 'Heritage',
    rate: 2400,
    rating: 4.98,
    reviews: 76,
    response: '10 min',
    status: 'ID Verified',
    image: 'assets/companion-aisha.svg',
    specialties: ['Charminar', 'Old City', 'Local history'],
    bio: 'Verified Hyderabad travel companion for public heritage routes, bazaar navigation, and calm first-time city exploration.',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'arjun',
    userId: 'user-arjun',
    name: 'Arjun Reddy',
    city: 'Hyderabad, Telangana',
    category: 'Photography',
    rate: 3200,
    rating: 4.95,
    reviews: 58,
    response: '18 min',
    status: 'ID Verified',
    image: 'assets/companion-arjun.svg',
    specialties: ['Golconda Fort', 'Street photography', 'Sunset routes'],
    bio: 'Verified travel companion for public photography walks, scenic routes, and relaxed destination planning across Hyderabad.',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'meera',
    userId: 'user-meera',
    name: 'Meera Iyer',
    city: 'Hyderabad, Telangana',
    category: 'Experiences',
    rate: 3600,
    rating: 4.92,
    reviews: 44,
    response: '25 min',
    status: 'ID Verified',
    image: 'assets/companion-meera.svg',
    specialties: ['Ramoji Film City', 'Public events', 'Family-friendly plans'],
    bio: 'Verified travel companion for destination days, ticketed public experiences, and event navigation around Hyderabad.',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  }
];

export const seedExperiences: readonly Experience[] = [
  {
    id: 'aisha-charminar-walk',
    companionId: 'aisha',
    title: 'Charminar and Laad Bazaar Walk',
    duration: '3 hour public experience',
    location: 'Charminar, Old City',
    price: 2400,
    includes: ['Public route', 'Bazaar guidance', 'Photo stops'],
    description: 'Explore Charminar, nearby lanes, bangles, chai stops, and local stories with a verified city companion.',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'aisha-food-trail',
    companionId: 'aisha',
    title: 'Old City Food Trail',
    duration: '3.5 hour public experience',
    location: 'Madina, Pathergatti, Charminar',
    price: 2800,
    includes: ['Food-stop shortlist', 'Queue help', 'Transit guidance'],
    description: 'A public food walk through iconic Hyderabad snacks, biryani spots, Irani chai, and dessert stops.',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'arjun-golconda-photo',
    companionId: 'arjun',
    title: 'Golconda Fort Photo Walk',
    duration: '4 hour public experience',
    location: 'Golconda Fort',
    price: 3200,
    includes: ['Sunset timing', 'Public route', 'Composition tips'],
    description: 'Walk Golconda Fort with photo-friendly pacing, viewpoint planning, and practical local context.',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'arjun-hussain-sagar',
    companionId: 'arjun',
    title: 'Hussain Sagar Evening Frames',
    duration: '2.5 hour public experience',
    location: 'Tank Bund and Necklace Road',
    price: 2100,
    includes: ['Golden-hour route', 'Snack stops', 'Ride guidance'],
    description: 'A breezy evening photography walk around the lake, public promenades, lights, and skyline views.',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'meera-ramoji-day',
    companionId: 'meera',
    title: 'Ramoji Film City Day',
    duration: '6 hour public experience',
    location: 'Ramoji Film City',
    price: 5200,
    includes: ['Entry timing', 'Show planning', 'Meal breaks'],
    description: 'A structured destination day with public attractions, show timing, rest breaks, and return coordination.',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  },
  {
    id: 'meera-event-evening',
    companionId: 'meera',
    title: 'Public Event Companion',
    duration: '3 hour public experience',
    location: 'HITEC City and Jubilee Hills',
    price: 3000,
    includes: ['Venue arrival', 'Seating help', 'Exit plan'],
    description: 'A verified companion for concerts, expos, cultural events, and other public venue plans.',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  }
];

export const availabilityDatesByCompanion: Record<string, string[]> = {
  aisha: ['2026-09-12', '2026-09-13', '2026-09-16', '2026-09-18'],
  arjun: ['2026-09-11', '2026-09-14', '2026-09-15', '2026-09-21'],
  meera: ['2026-09-12', '2026-09-17', '2026-09-19', '2026-09-22']
};

export const seedAvailability: Availability[] = Object.entries(availabilityDatesByCompanion).flatMap(
  ([compId, dates]) =>
    dates.map((d) => ({
      id: `avail-${compId}-${d}`,
      companionId: compId,
      date: d,
      isAvailable: true,
      createdAt: SEED_TIMESTAMP
    }))
);

export const seedBookings: readonly Booking[] = [
  {
    id: 'booking-demo-1',
    customerId: 'user-rohan',
    companionId: 'aisha',
    experienceId: 'aisha-charminar-walk',
    customerName: 'Rohan Mehta',
    customerEmail: 'rohan@example.com',
    date: '2026-09-12',
    partySize: 1,
    notes: 'First time in Hyderabad. Prefer a daytime public route with photo stops.',
    status: 'requested',
    totalPrice: 2400,
    currency: 'INR',
    createdAt: '2026-09-10T14:15:00.000Z',
    updatedAt: '2026-09-10T14:15:00.000Z'
  },
  {
    id: 'booking-demo-2',
    customerId: 'user-nisha',
    companionId: 'arjun',
    experienceId: 'arjun-golconda-photo',
    customerName: 'Nisha Rao',
    customerEmail: 'nisha@example.com',
    date: '2026-09-14',
    partySize: 2,
    notes: 'Looking for a sunset route and help with local transport timing.',
    status: 'accepted',
    totalPrice: 6400,
    currency: 'INR',
    createdAt: '2026-09-09T18:40:00.000Z',
    updatedAt: '2026-09-09T19:00:00.000Z'
  }
];

export const seedBookingEvents: readonly BookingEvent[] = [
  {
    id: 'evt-booking-demo-1-init',
    bookingId: 'booking-demo-1',
    fromStatus: 'requested',
    toStatus: 'requested',
    actorRole: 'customer',
    actorId: 'user-rohan',
    notes: 'Initial seed state',
    timestamp: '2026-09-10T14:15:00.000Z'
  },
  {
    id: 'evt-booking-demo-2-init',
    bookingId: 'booking-demo-2',
    fromStatus: 'requested',
    toStatus: 'accepted',
    actorRole: 'companion',
    actorId: 'user-arjun',
    notes: 'Initial seed state',
    timestamp: '2026-09-09T19:00:00.000Z'
  }
];

export const seedAuditLogs: readonly AuditLog[] = [
  {
    id: 'audit-init-1',
    actorId: 'system',
    actorRole: 'system',
    action: 'SYSTEM_BOOT',
    targetType: 'SYSTEM',
    targetId: 'hyderabad-v1',
    payload: { city: 'Hyderabad', version: '0.1.0' },
    createdAt: SEED_TIMESTAMP
  }
];

export function getHyderabadSeedData() {
  return {
    users: seedUsers.map((u) => ({ ...u })),
    profiles: seedProfiles.map((p) => ({ ...p })),
    companions: seedCompanions.map((c) => ({ ...c, specialties: [...c.specialties] })),
    experiences: seedExperiences.map((e) => ({ ...e, includes: [...e.includes] })),
    availability: seedAvailability.map((a) => ({ ...a })),
    bookings: seedBookings.map((b) => ({ ...b })),
    bookingEvents: seedBookingEvents.map((be) => ({ ...be })),
    auditLogs: seedAuditLogs.map((al) => ({ ...al, payload: { ...al.payload } }))
  };
}
