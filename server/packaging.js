// Package estimates used to get shipping rates from Shippo.
// These are STARTING GUESSES. Weigh a packed bag and box on a kitchen or
// postal scale and update the numbers so customers are charged correctly.
//
// oz    = weight of one filled bag, in ounces
// space = how much box room one bag takes up (1 = one small snack bag)

export const BAGS = {
  small:      { oz: 2, space: 1 },
  resealable: { oz: 5, space: 2 },
  large:      { oz: 7, space: 5 },
  premium:    { oz: 5, space: 2 }, // Premium flavors come in the resealable pouch
};

// Boxes you ship in, smallest first. Inches and ounces (empty box weight).
// space = how many "space" units fit in the box.
export const BOXES = [
  { name: "Small box",  length: 10, width: 8,  height: 6,  oz: 5,  space: 4 },
  { name: "Medium box", length: 14, width: 12, height: 8,  oz: 9,  space: 10 },
  { name: "Large box",  length: 18, width: 14, height: 12, oz: 16, space: 24 },
];

// Extra weight per box for tissue paper, padding, and the packing slip.
export const PACKING_OZ = 1;
