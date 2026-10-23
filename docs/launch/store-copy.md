# Call of Karen: HOA Warfare — Store Copy

Updated 2026-10-16. 16 factions shipped and recorded (1,589 .ogg voice files).

## Steam — Short Description (~300 chars)

The HOA has gone too far. Grab your Allowance AR and settle it the suburban
way: a 6v6 tactical FPS where Karens, HOA Dads, VC Bros, Tradwives, Furries,
and 11 other neighborhood archetypes battle for cul-de-sac dominance.
1,580+ voice lines. Zero mercy. Fines incoming.

## Steam — About This Game

**The lawn wars are real.**

CALL OF KAREN: HOA WARFARE is a satirical 6v6 suburban tactical first-person
shooter. Pick your faction — from the Karens (the manager is already on line
two) to the HOA Dads (measuring your grass with a ruler), the VC Bros, the
Woke Libs, the Tradwives (raw milk, no toxins), the Furries, the Weeb Mods,
and 9 more neighborhood archetypes — and fight for control of the cul-de-sac.

**Every faction is fully voiced.** Over 1,580 hand-written, studio-rendered
voice lines cover spawns, kills, headshots, streaks, victories, defeats, and
faction-vs-faction rivalries. The Karens do NOT get along with the Woke Libs.
The Pickleball Retirees have annexed the tennis courts. The Tradwives are
filming everything. You will hear about it.

**Key Features**

- **16 playable suburban factions**, each with a distinct voice, personality,
  and full voice-line set — no silent protagonists here
- **4 suburban battlegrounds**: Oakridge Cul-de-Sac, Shady Pines Pickleball
  Club, Sunset Strip Mall Parking Lot, and the new Model Home Showcase (Nuketown-style)
- **8 game modes**: Cul-de-Sac Clash (team deathmatch), Wipeout, Receipt Check
  (kill-confirmed), King of the Lawn (hardpoint), Evict the Block (Search & Destroy),
  HOA Patrol (domination), Steal the Casserole (capture the flag), and Lone Wolf (you alone against a whole faction)
- **Driveable vehicles & killstreaks**: mount the suburban riding lawn mower,
  trigger the 3-streak Ring Doorbell UAV, call in Dad's RC Patrol Helicopter (5-streak),
  a 7-streak Lawn Mower Stampede, or the devastating 9-streak Fine From Above (thermal drone gunship)
- **Progression & Customization**: Create-a-Class (pick primary + 1 tactical perk),
  Weapon Camo Mastery (Beige, Mulch, Granite, 24K Gold), and Re-Zoning (Prestige Ranks)
- **Suburban arsenal**: the Allowance AR, Lawsuit Grenades, the Participation
  Trophy (melee), the Ban Hammer, and more
- **Rivalry system**: matched factions trash-talk each other with bespoke
  kill lines — 60+ directional rivalries and counting
- **Camping snitch**: hide too long and your own team rats you out
- **Killcams with custom taunts**, HOA Violation Citations, headshot bonuses,
  and Suburban Stockades post-match shame podium

**Try the free web demo** — 6 factions, right in your browser. Love it?
Unlock all 16 factions and full battlegrounds on Steam for $4.99.

---

*Call of Karen: HOA Warfare is a parody. Any resemblance to your actual HOA
is entirely the point.*

**Content creators:** record, stream, and monetize all the gameplay you want.
Go viral. We insist.

## Steam — Tags / Genres

FPS, Satire, Comedy, Multiplayer, 6v6, Tactical, Indie, Single-player bots,
Funny, Parody, First-Person Shooter, Casual

## Steam — Capsule Art (Generated & Verified)

Located in `assets/steam/`:
- Header capsule: 460×215 (`assets/steam/header_capsule.jpg`)
- Small capsule: 231×87 (`assets/steam/small_capsule.jpg`)
- Main capsule: 616×353 (`assets/steam/main_capsule.jpg`)
- Library Hero: 1920×620 (`assets/steam/library_hero.jpg`)
- Library Logo: 1280×720 (`assets/steam/library_logo.png`)
- Community Icon: 32×32 (`assets/steam/community_icon.png`)
- Client Icon: 256×256 (`assets/steam/client_icon.png`)

## itch.io — Page Copy (Shorter, Punchier)

**CALL OF KAREN: HOA WARFARE — free web demo**

The HOA has gone too far. 6v6 suburban tactical FPS in your browser:
Karens vs. HOA Dads vs. Tradwives vs. Furries vs. 12 more neighborhood
archetypes. 1,580+ voice lines. Fines incoming.

🎮 Play the free demo right here in your browser — no download. 6 factions.
💥 Like it? Unlock all 16 factions and custom maps on Steam for $4.99.

Streamers: record and monetize everything. Go viral. We insist.

Controls: WASD + mouse. Click to lock in.

## CrazyGames — Developer Notes

- Upload the web demo zip (`dist/hoa-warfare-web-demo.zip`)
- Category: Shooting / .io-style
- Keep in DRAFT until the QA pass is clean
- Ad revenue share activates after approval

## Newgrounds — Notes

- Upload as an HTML5 game, keep UNPUBLISHED until ready
- Tag: comedy, fps, parody
- Newgrounds audience loves edgy parody — lean into the rivalry lines in
  the description

## Demo Gating Architecture (Implemented)

Per the funnel strategy (`data/demo.json`), the public web demo ships with:
- 6 unlocked demo factions: `karens`, `tradwives`, `hoaDads`, `furries`, `trumpers`, `pickleballRetirees`
- 10 gated factions (`vcBros`, `wokeLibs`, `rednecks`, `fratHouse`, `brainRot`, `valleyGirls`, `gymRats`, `cloutStreamers`, `theGays`, `animeWeebs`) with in-game Steam modal upsell
- Flagship map: Oakridge Cul-de-Sac (Pickleball Club & Strip Mall gated to $4.99 full release)
- Gated Career progression (Ranks 1–5 in demo, Ranks 6–10 in full release)
- Post-match Steam CTA card with configurable unskippable timer (`ctaLockSec: 4`)
