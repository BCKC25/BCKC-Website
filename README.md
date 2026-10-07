# Big Cheese Kettle Co. Website

Website for Big Cheese Kettle Co., LLC — small-batch, handmade kettle corn from Aiken, SC.

## Files

- `index.html` — the whole site (styles and scripts included)
- `img/` — logo and product photos

## Things to edit

Open `index.html` and find the block marked `EDIT THESE` near the bottom.

| Setting | What it does |
| --- | --- |
| `SQUARE_STORE_URL` | Your Square Online store link. Every Order button goes here unless an item has its own link. |
| `SQUARE_LINKS` | Optional Square payment link per item, keyed `flavor-size`, e.g. `"pickle-resealable"`. Sizes: `small`, `resealable`, `large`. Premium flavors use `-premium`, e.g. `"maple-bacon-premium"`. |
| `CONTACT_EMAIL` | Booking email shown under the events list. Leave `""` to hide it. |
| `DELIVERY_ZIPS` | ZIP codes you deliver to. Used by the delivery checker. |
| `EVENTS` | Upcoming events. Dates are `YYYY-MM-DD`. Past events hide on their own. |

Flavor IDs: `original`, `cheddar`, `white-cheddar`, `pickle`, `chili-lime`, `caramel`, `jalapeno-cheddar`, `black-truffle-parmesan`, `maple-bacon`.

## Before going live

- Replace the example events.
- Confirm the delivery ZIP codes.
- Check the Ordering & Delivery wording (free event pickup, payment options, shipping) matches your Square setup.

## Publishing with GitHub Pages

Settings → Pages → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)`. To use bigcheesekettleco.com, enter it under **Custom domain** and point your domain's DNS at GitHub Pages.
