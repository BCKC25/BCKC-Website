// Prices the server charges, in cents. The website shows the same prices,
// so if you change one here, change it in index.html too.

const MAIN_SIZES = {
  small: { label: "Small", price: 500 },
  resealable: { label: "Resealable", price: 800 },
  large: { label: "Large", price: 1500 },
};
const PREMIUM_SIZES = {
  premium: { label: "Resealable", price: 800 },
};

export const MENU = {
  "original": { name: "Original Kettle Corn", sizes: MAIN_SIZES },
  "cheddar": { name: "Cheddar", sizes: MAIN_SIZES },
  "white-cheddar": { name: "White Cheddar", sizes: MAIN_SIZES },
  "pickle": { name: "Pickle Popcorn", sizes: MAIN_SIZES },
  "chili-lime": { name: "Chili Lime", sizes: MAIN_SIZES },
  "caramel": { name: "Caramel Corn", sizes: MAIN_SIZES },
  "jalapeno-cheddar": { name: "Jalapeño Cheddar", sizes: PREMIUM_SIZES },
  "black-truffle-parmesan": { name: "Black Truffle Parmesan", sizes: PREMIUM_SIZES },
  "maple-bacon": { name: "Maple Bacon", sizes: PREMIUM_SIZES },
};

export const MAX_QTY_PER_LINE = 50;
