// Package details used to get shipping rates from Shippo.
//
// oz    = weight of one filled bag, in ounces
// space = how much box room one bag takes up
//
// The standard box holds 6 space units: 6 small bags, 3 resealable bags,
// or 2 large bags (or a mix, e.g. 1 large + 1 resealable + 1 small).

export const BAGS = {
  small:      { oz: 5,  space: 1 },
  resealable: { oz: 5,  space: 2 },
  large:      { oz: 15, space: 3 },
  premium:    { oz: 5,  space: 2 }, // Premium flavors come in the resealable pouch
};

// Boxes you ship in, smallest first. Inches and ounces (empty box weight).
// Orders that don't fit in one box are split across several of the largest box.
// To add a bigger box later, add a line below the standard box.
export const BOXES = [
  { name: "Standard box", length: 15, width: 12, height: 8, oz: 12, space: 6 }, // oz = ESTIMATE, weigh an empty box
];

// Extra weight per box for tissue paper, padding, and the packing slip.
export const PACKING_OZ = 1;
