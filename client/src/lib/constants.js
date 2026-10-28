export const CONDITIONS = {
  like_new: { label: "Like new", hint: "No visible wear. Often with box and accessories." },
  excellent: { label: "Excellent", hint: "Light signs of use you only notice up close." },
  good: { label: "Good", hint: "Visible marks or scratches. Works as it should." },
  fair: { label: "Fair", hint: "Heavy cosmetic wear or a noted issue. Priced to match." },
  for_parts: { label: "For parts", hint: "Not fully working. Sold for repair or spare parts." },
};

export const STATUSES = {
  available: { label: "Available now", short: "Available" },
  preorder: { label: "Pre-order", short: "Pre-order" },
  sold: { label: "Sold out", short: "Sold" },
  unavailable: { label: "Unavailable", short: "Unavailable" },
};

export const CATEGORY_ICONS = ["cpu", "gpu", "ram", "storage", "motherboard", "psu", "laptop", "case", "fan", "monitor", "keyboard", "mouse", "other"];

/** Steps of a pre-order / sourcing request in the admin tracker. */
export const INQUIRY_STATUSES = {
  inquiry: "Inquiry",
  sourcing: "Sourcing",
  expected: "Expected",
  available: "Available",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];
