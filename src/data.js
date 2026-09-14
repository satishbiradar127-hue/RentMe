export const companions = [
  {
    id: "aisha",
    name: "Aisha Khan",
    city: "Hyderabad, Telangana",
    category: "Heritage",
    rate: 2400,
    rating: 4.98,
    reviews: 76,
    response: "10 min",
    status: "ID Verified",
    image: "assets/companion-aisha.svg",
    specialties: ["Charminar", "Old City", "Local history"],
    bio: "Verified Hyderabad travel companion for public heritage routes, bazaar navigation, and calm first-time city exploration.",
    availability: ["2026-09-12", "2026-09-13", "2026-09-16", "2026-09-18"],
    experiences: [
      {
        id: "aisha-charminar-walk",
        title: "Charminar and Laad Bazaar Walk",
        duration: "3 hour public experience",
        location: "Charminar, Old City",
        price: 2400,
        includes: ["Public route", "Bazaar guidance", "Photo stops"],
        description: "Explore Charminar, nearby lanes, bangles, chai stops, and local stories with a verified city companion."
      },
      {
        id: "aisha-food-trail",
        title: "Old City Food Trail",
        duration: "3.5 hour public experience",
        location: "Madina, Pathergatti, Charminar",
        price: 2800,
        includes: ["Food-stop shortlist", "Queue help", "Transit guidance"],
        description: "A public food walk through iconic Hyderabad snacks, biryani spots, Irani chai, and dessert stops."
      }
    ]
  },
  {
    id: "arjun",
    name: "Arjun Reddy",
    city: "Hyderabad, Telangana",
    category: "Photography",
    rate: 3200,
    rating: 4.95,
    reviews: 58,
    response: "18 min",
    status: "ID Verified",
    image: "assets/companion-arjun.svg",
    specialties: ["Golconda Fort", "Street photography", "Sunset routes"],
    bio: "Verified travel companion for public photography walks, scenic routes, and relaxed destination planning across Hyderabad.",
    availability: ["2026-09-11", "2026-09-14", "2026-09-15", "2026-09-21"],
    experiences: [
      {
        id: "arjun-golconda-photo",
        title: "Golconda Fort Photo Walk",
        duration: "4 hour public experience",
        location: "Golconda Fort",
        price: 3200,
        includes: ["Sunset timing", "Public route", "Composition tips"],
        description: "Walk Golconda Fort with photo-friendly pacing, viewpoint planning, and practical local context."
      },
      {
        id: "arjun-hussain-sagar",
        title: "Hussain Sagar Evening Frames",
        duration: "2.5 hour public experience",
        location: "Tank Bund and Necklace Road",
        price: 2100,
        includes: ["Golden-hour route", "Snack stops", "Ride guidance"],
        description: "A breezy evening photography walk around the lake, public promenades, lights, and skyline views."
      }
    ]
  },
  {
    id: "meera",
    name: "Meera Iyer",
    city: "Hyderabad, Telangana",
    category: "Experiences",
    rate: 3600,
    rating: 4.92,
    reviews: 44,
    response: "25 min",
    status: "ID Verified",
    image: "assets/companion-meera.svg",
    specialties: ["Ramoji Film City", "Public events", "Family-friendly plans"],
    bio: "Verified travel companion for destination days, ticketed public experiences, and event navigation around Hyderabad.",
    availability: ["2026-09-12", "2026-09-17", "2026-09-19", "2026-09-22"],
    experiences: [
      {
        id: "meera-ramoji-day",
        title: "Ramoji Film City Day",
        duration: "6 hour public experience",
        location: "Ramoji Film City",
        price: 5200,
        includes: ["Entry timing", "Show planning", "Meal breaks"],
        description: "A structured destination day with public attractions, show timing, rest breaks, and return coordination."
      },
      {
        id: "meera-event-evening",
        title: "Public Event Companion",
        duration: "3 hour public experience",
        location: "HITEC City and Jubilee Hills",
        price: 3000,
        includes: ["Venue arrival", "Seating help", "Exit plan"],
        description: "A verified companion for concerts, expos, cultural events, and other public venue plans."
      }
    ]
  }
];

export const categories = ["All", ...new Set(companions.map((companion) => companion.category))];

export const seedBookings = [
  {
    id: "booking-demo-1",
    companionId: "aisha",
    experienceId: "aisha-charminar-walk",
    customerName: "Rohan Mehta",
    customerEmail: "rohan@example.com",
    date: "2026-09-12",
    partySize: 1,
    notes: "First time in Hyderabad. Prefer a daytime public route with photo stops.",
    status: "requested",
    createdAt: "2026-09-10T14:15:00.000Z"
  },
  {
    id: "booking-demo-2",
    companionId: "arjun",
    experienceId: "arjun-golconda-photo",
    customerName: "Nisha Rao",
    customerEmail: "nisha@example.com",
    date: "2026-09-14",
    partySize: 2,
    notes: "Looking for a sunset route and help with local transport timing.",
    status: "accepted",
    createdAt: "2026-09-09T18:40:00.000Z"
  }
];
