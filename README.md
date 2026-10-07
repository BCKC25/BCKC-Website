# Big Cheese Kettle Co. Website

Website for Big Cheese Kettle Co., LLC — small-batch, handmade kettle corn from Aiken, SC.

| Part | Where it runs | What it does |
| --- | --- | --- |
| `index.html`, `img/` | GitHub Pages | The site, cart, and checkout form |
| `server/` | DigitalOcean droplet | Prices the cart, creates the order in Square, charges the card |
| `deploy/` | droplet | Service and web server config for the checkout server |

Card numbers go straight from the customer's browser to Square. Your server only ever sees a one-time card token.

---

## 1. Edit the site

Open `index.html` and find the block marked `EDIT THESE` near the bottom.

| Setting | What it does |
| --- | --- |
| `API_BASE` | Address of your checkout server. Default: `https://api.bigcheesekettleco.com` |
| `CONTACT_EMAIL` | Booking email under the events list. `""` hides it. |
| `EVENTS` | Your events. Dates are `YYYY-MM-DD`. Past events hide on their own, and upcoming events become pickup choices at checkout. **Replace the example events before going live.** |

Prices appear in two places: `SIZES` / `PREMIUM_PRICE` in `index.html` (what customers see) and `server/menu.js` (what they're charged). Change both together.

## 2. Get your Square keys

1. Sign in at [developer.squareup.com](https://developer.squareup.com) with your Square account and create an application.
2. Under **Credentials**, the **Sandbox** tab has a test Application ID and Access Token. **Production** has the real ones.
3. Under **Locations**, copy your Location ID (sandbox and production each have their own).

Keep the access token secret. It only goes in the `.env` file on the droplet.

## 3. Point a subdomain at the droplet

At your domain registrar (or DigitalOcean DNS), add an **A record**:

- Name: `api`
- Value: your droplet's IP address

## 4. Set up the droplet (Ubuntu)

SSH in and run:

```bash
# Node.js 22, nginx, certbot
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx git

# App user and code
sudo useradd --system --create-home --shell /usr/sbin/nologin bckc
sudo git clone https://github.com/BCKC25/BCKC-Website.git /opt/bckc-website
cd /opt/bckc-website/server
sudo npm ci --omit=dev

# Settings
sudo cp .env.example .env
sudo nano .env          # fill in your Square sandbox keys first
sudo chown -R bckc:bckc /opt/bckc-website
sudo chmod 600 .env

# Run it as a service
sudo cp /opt/bckc-website/deploy/bckc-checkout.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bckc-checkout
curl http://127.0.0.1:3000/api/health     # should print {"ok":true,...}

# HTTPS for api.bigcheesekettleco.com
sudo cp /opt/bckc-website/deploy/nginx-api.conf /etc/nginx/sites-available/api.bigcheesekettleco.com
sudo ln -s /etc/nginx/sites-available/api.bigcheesekettleco.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.bigcheesekettleco.com
sudo ufw allow 'Nginx Full'
```

Check it from your phone or laptop: `https://api.bigcheesekettleco.com/api/health`

**Pulling updates later:**

```bash
cd /opt/bckc-website && sudo -u bckc git pull
cd server && sudo -u bckc npm ci --omit=dev && sudo systemctl restart bckc-checkout
```

**Logs:** `sudo journalctl -u bckc-checkout -f`

## 5. Server settings (`server/.env`)

| Setting | Notes |
| --- | --- |
| `SQUARE_ENVIRONMENT` | `sandbox` for testing, `production` for real money |
| `SQUARE_ACCESS_TOKEN`, `SQUARE_APPLICATION_ID`, `SQUARE_LOCATION_ID` | From step 2. Must all match the environment above. |
| `ALLOWED_ORIGINS` | Sites allowed to use the checkout |
| `DELIVERY_FEE` | Blank = local delivery stays **off**. Set it (e.g. `5.00`) to turn it on. |
| `FREE_DELIVERY_MINIMUM` | Optional free-delivery threshold |
| `DELIVERY_ZIPS` | ZIPs you deliver to. **Confirm before turning delivery on.** |
| `SHIPPING_FEE` | Blank = shipping stays **off**. |
| `FREE_SHIPPING_MINIMUM` | Optional free-shipping threshold |
| `SHIP_STATES` | Limit shipping to these states. Blank = any US state. |
| `INCLUSIVE_TAX_PERCENT` | Records sales tax inside your prices in Square's reports. Never adds to the customer's total. Blank to skip. |

After changing `.env`: `sudo systemctl restart bckc-checkout`. The site picks up fee and ZIP changes on its own.

Event pickup is always free and available whenever you have upcoming events listed.

## 6. Test with sandbox

With `SQUARE_ENVIRONMENT=sandbox`, place an order on the live site using Square's test card **4111 1111 1111 1111**, any future expiration, any CVV, any ZIP. The order appears in your **Sandbox** Square dashboard (open it from the Developer Dashboard), not your real one. No money moves.

## 7. Go live

1. In `.env`, set `SQUARE_ENVIRONMENT=production` and paste the **production** Application ID, Access Token, and Location ID.
2. `sudo systemctl restart bckc-checkout`
3. Place one small real order, then refund it from your Square dashboard.

Online orders show up in your regular Square dashboard alongside your booth sales.

## Apple Pay (optional)

Google Pay shows up on its own when the customer's browser supports it. Apple Pay needs your domain registered first:

1. In the Square Developer Dashboard, open **Apple Pay** for your app and add `bigcheesekettleco.com`.
2. Download the verification file it gives you and save it in this repo at `.well-known/apple-developer-merchantid-domain-association` (no file extension).
3. Commit and push, then click **Verify** in Square.

The `.nojekyll` file in this repo lets GitHub Pages serve that `.well-known` folder.

## Publishing the site with GitHub Pages

Settings → Pages → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)`. Under **Custom domain** enter `bigcheesekettleco.com`, then point the domain's DNS at GitHub Pages and tick **Enforce HTTPS**. Card payments require HTTPS.
