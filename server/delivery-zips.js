// ZIP codes for free local delivery: every ZIP whose center is within 10 miles of
// downtown Aiken, SC (33.5604, -81.7196). Generated from US ZIP code center points.
// A ZIP that straddles the 10-mile line is in or out based on its center.
// To add or remove one, edit this list (or set DELIVERY_ZIPS in .env to override it).

export const DELIVERY_RADIUS_MILES = 10;

export const DELIVERY_ZIPS = [
  "29802", // Aiken, SC — 0 mi
  "29801", // Aiken, SC — 0.5 mi
  "29803", // Aiken, SC — 4 mi
  "29851", // Warrenville, SC — 5 mi
  "29829", // Graniteville, SC — 5.5 mi
  "29850", // Vaucluse, SC — 6.3 mi
  "29828", // Gloverville, SC — 6.9 mi
  "29804", // Aiken, SC — 7.1 mi
  "29808", // Aiken, SC — 7.1 mi
  "29834", // Langley, SC — 7.7 mi
  "29839", // Montmorenci, SC — 7.8 mi
  "29816", // Bath, SC — 9.4 mi
  "29822", // Clearwater, SC — 9.4 mi
];
