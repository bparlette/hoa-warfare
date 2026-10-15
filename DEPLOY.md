# Steam Deployment & Publishing Strategy

## Distribution Funnel: Free Web Demo → $4.99 Steam Release

The optimal distribution engine is a **Free Web Demo Funnel powering a Steam Paid Release**. Selling directly on web portals yields low conversions, whereas players gladly pay $4.99 on Steam if a zero-friction browser demo hooks them first.

| Platform | Role in Funnel | Monetization / Mechanics | Primary Value |
|---|---|---|---|
| Steam | Revenue Engine | $4.99 Full Purchase | Massive buyer pool, impulse price point, handles payments & updates. |
| itch.io | Viral Hook & Demo | Free In-Browser Demo (HTML5/WebGL) | Streamer discovery, embeddable, links directly to Steam wishlist/store. |
| CrazyGames | Traffic Multiplier | Free Web Demo + Ad Rev-Share | Access to 50M+ monthly browser players; pushes organic viral volume. |
| Newgrounds | Cult Culture Seed | Free Web Demo | High tolerance for edgy subculture parodies; core meme catalyst. |

### Execution Strategy

* **Zero-Friction Demo:** Export a lightweight WebGL build containing 4–6 archetypes. Do not require downloads; keep it playable directly inside desktop and mobile browsers.
* **The $4.99 Steam Funnel:** When a player clears the demo or dies, show an unskippable end-screen CTA: "Unlock all 24 archetypes for $4.99 on Steam" with a direct tracking link.
* **Streamer / Clip Bait:** Add a dedicated "Clip & Share" or copy-to-clipboard stats summary at run completion to seed TikTok, X, and YouTube Shorts traffic back to the web demo.

### Game Launch Funnel

1. **Primary Store ($4.99 paid game):** https://partner.steamgames.com/
2. **Free Web Demo Platforms (zero friction, high viral loop):**
   - itch.io: https://itch.io/
   - CrazyGames Developer: https://developer.crazygames.com/
   - Newgrounds: https://www.newgrounds.com/

**Strategy:** Host the playable WebGL browser demo on itch.io & CrazyGames → end screen routes directly to the $4.99 Steam checkout.

### How the web demo implements this (engineering notes)

* `npm run pack` writes `dist/demo/` and `dist/hoa-warfare-web-demo.zip` (~9 MB): a static, relative-path build with `index.html` at the root (the layout itch.io, CrazyGames and Newgrounds all expect). It ships only the demo factions' voice lines and no marketing video, and fails if the zip passes 40 MB.
* Demo settings live in `data/demo.json`: which factions are playable, the Steam URL and UTM tag per portal, CTA copy, and the unskippable delay. Until the Steam page exists the CTA points at a wishlist placeholder; set `steamUrl` once the app ID is live.
* Match end shows the Steam CTA (unskippable for a few seconds) plus **Clip & Share**: copies a stats summary + demo link, or opens the phone's share sheet.
* Archetype count in the CTA is read from the content file so it stays true as factions ship (currently 20 after the merges, not 24).

---

## TOP SECTION: The Steam Dilemma: Publish Page Immediately, Do Not Launch Early

Put your **"Coming Soon"** Steam Store Page live immediately, but **do not publish the game for purchase right away**.

Releasing a raw, day-one playable build directly onto the Steam store without wishlists will bury it in Valve's algorithm permanently. Conversely, promoting the game on social media without a live Steam store page squanders viral traffic, because interested players have nowhere to bookmark the game.

### Strategy Phases

| Strategy Phase | What You Do | Why It Matters |
|---|---|---|
| **Phase 1: Coming Soon Page (Immediate)** | Pay the $100 Steam Direct fee, set up the store page with trailer/screenshots, and hit publish as "Coming Soon". | Establishes prior art and ownership (timestamped proof). Collects wishlists from day one. |
| **Phase 2: Free Web Demo / Social Hype** | Put a 4-to-6 archetype demo on [itch.io](https://itch.io/) or [CrazyGames](https://developer.crazygames.com/). Share clips on TikTok/Shorts with the Steam page linked. | Captures the organic viral spike and funnels players straight to your Steam Wishlist button. |
| **Phase 3: Launch at 7k–10k Wishlists** | Release the full $4.99 build once you have accumulated enough wishlists to trigger Steam's *Popular Upcoming* algorithm. | Wishlist notifications blast all users on day one, rocketing the game onto Steam's top seller charts. |

---

### Why People Can't Easily "Steal" It

* **Clone Speed vs. Viral Momentum**: Cloning a game takes weeks to months even for fast copycats. If your "Coming Soon" Steam page is already live and public, you own the search SEO, the title, and the original creator status.
* **The Humor & Voice Is the Moat**: Archetype parodies (dialogue, voice lines, meme pacing, visual tropes) cannot be generated overnight by an asset-flipper. The personality of the 24 archetypes is what sells, not the raw mechanics.
* **The "Stealing Traffic" Risk**: The real risk isn't copycats; it's wasting attention. If a TikTok gets 500k views today and there is no Steam page to wishlist, 99% of those viewers forget your game by tomorrow.

---

## BOTTOM SECTION: Recommended Steam Release Timeline

1. **Day 1: Register Steam App ($100 fee) & set status to "Coming Soon"**
   - **URL**: [https://partner.steamgames.com/](https://partner.steamgames.com/)
   - Establishes original ownership/timestamp and enables the "Wishlist" button.

2. **Weeks 1–4: Build Hype & Post Browser Demo**
   - **itch.io**: [https://itch.io/](https://itch.io/)
   - **CrazyGames Developer**: [https://developer.crazygames.com/](https://developer.crazygames.com/)
   - Drive all TikTok / Shorts / Streamer traffic directly to **Wishlist on Steam**.

3. **Launch Day: Push $4.99 build live**
   - Triggers automated Steam email blasts to all wishlisters simultaneously.
   - Gives the algorithm the initial velocity needed for organic front-page placement.
