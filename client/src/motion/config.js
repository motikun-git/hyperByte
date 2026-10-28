// One place to tune every animation on the site.
// Times are in milliseconds. CSS durations/easings live in styles/base.css (--ease-out, --dur...).
export const MOTION = {
  ease: {
    out: "cubic-bezier(0.16, 1, 0.3, 1)",
    inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
  },
  stagger: {
    chars: 32, // delay between letters in the hero headline
    items: 70, // delay between cards when a grid appears
  },
  intro: {
    duration: 2600, // the opening sequence, shown once per browser session
    sessionKey: "hb_intro_seen",
  },
  phrases: {
    interval: 3400, // rotating hero phrases
  },
  hero: {
    parallax: 30, // px that floating hardware moves with the mouse
    tilt: 8, // degrees of perspective change with the mouse
    scrollDrift: 260, // px the hardware drifts while the hero scrolls away
  },
  cursor: {
    influence: 190, // px radius in which background stars bend toward the pointer
    pull: 34, // how strongly stars bend
    core: 9, // black-hole core radius in px
    orbiters: 16, // particles orbiting the core
    trail: 22, // points kept for the light trail
    maxStars: 260,
    sparkleShare: 0.3, // part of the stars drawn as ✦ sparkles; the rest are tiny dots
    binaryRows: 24, // most rows of drifting 0s and 1s in the background
    showerEvery: [7000, 15000], // a small meteor shower every 7 to 15 seconds
    starDensity: 6500, // one star per this many square px
    maxPixelRatio: 1.75,
  },
  card: {
    tilt: 7, // max degrees a product card tilts toward the pointer
  },
};
