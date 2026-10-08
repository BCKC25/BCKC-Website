// Package details used to get shipping rates from Shippo.

// Weight of one filled bag, in ounces. Premium flavors use the resealable pouch.
export const BAGS = {
  small:      { oz: 5,  packAs: "small" },
  resealable: { oz: 5,  packAs: "resealable" },
  large:      { oz: 15, packAs: "large" },
  premium:    { oz: 5,  packAs: "resealable" },
};

// Boxes you ship in, smallest first. Inches and ounces (empty box weight).
// fits = how many of each bag fill the box on its own. 0 = that bag doesn't fit.
// Mixed orders fit as long as the fractions add up to one box or less
// (e.g. small box: 1 small + 1 resealable = 1/3 + 1/2, fits).
// The smallest box that fits the whole order is used. Orders too big for one box
// are split across several of the LAST (largest) box.
export const BOXES = [
  { name: "Small box",    length: 12, width: 8,  height: 8, oz: 8,  fits: { small: 3, resealable: 2, large: 0 } }, // oz = ESTIMATE
  { name: "Standard box", length: 15, width: 12, height: 8, oz: 12, fits: { small: 6, resealable: 3, large: 2 } },
];

// Extra weight per box for tissue paper, padding, and the packing slip.
export const PACKING_OZ = 1;

// Orders with more bags than this are handled by email instead of online checkout.
export const MAX_BAGS_PER_ORDER = 10;
