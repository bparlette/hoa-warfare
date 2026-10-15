# REVIEW REQUEST (v4)

Review this game design doc (v4) like a skeptical creative director. It's a low-poly retro-3D multiplayer FPS called **Call of Karen: HOA Warfare** — a comedy "opposite route" answer to the viral $6 shooter Hood Warfare 2, with 12 stereotype factions (frat boys, emo kids, Karens, brain-rot iPad kids, HOA dads, etc.) battling across suburbia. The game that roasts everyone (including you).

**Reference art (open these first):**
- 16-bit concept mockup — gameplay screenshot + 16-bit vs 8-bit asset sheet (THE visual target): https://drive.google.com/file/d/1mRaXhs0-r5BFmsaKjyvw5AI5RkymlnLd/view?usp=drivesdk
- Faction art — Frat House, Karen, Brain Rot (low-poly 3D): https://drive.google.com/file/d/1V0izx1bOyXY5pvdv0Ka321T0bVISoPsb/view?usp=drivesdk
- All three together in the Cul-de-Sac level mockup: https://drive.google.com/file/d/1UygBYDXbLUNJ2f4mB5ngLXgfpqLwZce4/view?usp=drivesdk

**What's locked in v4:** art direction is now the hybrid — low-poly 3D characters + pixel textures + low-res render target with limited-palette shader (screenshots look 16-bit, plays like a real 3D shooter). 8-bit is UI/icons/chiptune only, never characters. Roblox prototype gets models + textures WITHOUT the pixel-render effect (no custom screen shaders on Roblox); full 16-bit look is Steam-only. Two genuinely distinct voice scripts (Roblox clean / Steam vicious — different jokes, not word-swaps).

Be brutal and specific:
1. Pressure-test the hybrid art call: is "low-res render target + palette shader" actually modest cost in Unity/Godot, or am I underestimating it? Any technical gotcha?
2. Does the Roblox/Steam visual split break the "prove it on Roblox first" phasing — will the prototype misrepresent the concept?
3. Which faction is still the weakest link — who gets cut if we need 11?
4. Two scripts (Clean + Steam): sane economics, or does it double voice costs for no reason?
5. Legal/cultural check round 2: any lines still risky? (Trademark, real-person, or "punching down" audit.)
6. Title: "Call of Karen: HOA Warfare" — does the Call of Duty parody survive trademark scrutiny? Better options?
7. What's still most likely to kill this game?
8. Any jokes that still won't land? Quote the exact lines.
9. The camping self-snitch: brilliant or annoying in practice?

Don't be polite. Find the holes.

---


**Working title:** Call of Karen: HOA Warfare (alternates: Gated Community Warfare, Cul-de-Sac Ops, Subdivision Six)
**Genre:** Low-poly retro-3D multiplayer FPS (PS1/Quake/BattleBit style with pixel textures) — the comedy "opposite route" answer to Hood Warfare 2
**High concept:** Everything that made a $6 CoD clone go viral — borrowed CoD skeleton, full comedy vocabulary swap, impulse price, clip-friendly chaos — rebuilt with the setting flipped: twelve stereotype factions battle across suburbia. The game that roasts everyone (including you).
**What changed in v4 (art direction LOCKED):** hybrid retro spec per the 16-bit concept mockup — low-poly 3D characters + pixel textures + low-res render target with limited-palette shader, so screenshots look 16-bit while the game plays like a real 3D shooter (real hitboxes, vertical aim, ragdolls). 8-bit reserved for menus/icons/chiptune, never characters. Platform split spelled out: Roblox gets models + textures WITHOUT the pixel-render effect (no custom screen shaders on Roblox); the full 16-bit look is Steam-only (Unity/Godot). Visual target: https://drive.google.com/file/d/1mRaXhs0-r5BFmsaKjyvw5AI5RkymlnLd/view?usp=drivesdk

---

## 1. Design pillars

1. **The vocabulary IS the product.** Borrowed CoD skeleton; all originality in theme, writing, voice.
2. **Every faction is a content engine.** 12 factions, 66 matchups, rivalry lines — the game markets itself through clips.
3. **Roast everyone, harm no one.** Every faction gets it equally. Vicious about subcultures, never about protected groups or real people.
4. **Comedy is physics + voice.** Low-poly ragdolls flopping down stairs + committed voice acting = the clip. (v2's sprite plan couldn't deliver this; v3 fixes it.)
5. **Cheap and chaotic.** Impulse price or free; low spec; bots fill lobbies.
6. **The 1.8-second rule.** No bark runs longer than ~1.8 seconds. If the joke needs explaining, it's dead.

## 2. Voice-line event system (v3)

| Event | Trigger | Chance |
|---|---|---|
| Kill (generic) | Any kill | 40% |
| Headshot | Headshot kill | 100% |
| Revenge kill | Killing your killer | 100% |
| Shutdown | Ending an enemy's 3+ streak | 100% |
| Melee kill | Melee kill | 100% |
| Humiliated | Killed by enemy melee | 100% |
| Double / Triple / Rampage | 2 / 3 / 4+ rapid kills | 100% |
| Reload | Reloading | 10–15%, team-local 3D audio only |
| Enemy spotted | First spot ping | 10–15%, team-local 3D audio only |
| Low health | HP < 25% | 50% |
| Objective taken/lost | Mode events | 100% |
| Enemy killstreak inbound | Panic callout | 100% |
| Last alive | Sole survivor | 100% |
| Round start | Match begin | 100% |
| Own killstreak earned | Streak achieved | 100% |
| **First Blood** (new) | Opening kill of match | 100% |
| **Self-kill** (new) | Suicide (launcher, fall, etc.) | 100% — humiliating self-roast |
| **Killstreak destroyed** (new) | Shooting down Dad's Helicopter | 100% — rage moment |
| **Camping snitch** (new) | 20s inside 3m radius | 100% — own character snitches on self |
| **Post-match podium** (new) | MVP + bottom-fragger roast | 100% — end-of-round clip farm |

**Rules (v3, bug-fixed):**
- **Priority:** own killstreak > multikill > rivalry line > revenge/shutdown > headshot > generic kill. (v2 forgot rivalry lines — fixed.)
- **Interrupt:** a higher-priority event interrupts and overrides an active lower-priority cooldown. (v2's flat 5s cooldown ate double-kill lines — fixed.)
- **Cooldowns:** ~5s per player per tier; no line repeats until its pool is exhausted.
- **Killcam caching:** the killcam plays the exact audio ID of the fatal blow, isolated from live match audio. No desync, no cut-off mid-replay.
- **Ducking:** lines never talk over the announcer.
- **Killcam rule:** the victim hears the killer's line. The 3-second clip is the design center.

## 3. The 12 factions (v3 scripts)

Two scripts exist: **Clean** (Roblox) and **Steam** (edgier). Lines below are the base; Steam-only alternates are marked [S]. The Steam script isn't word-swaps — it's distinct, more vicious jokes (Zyn pouches, Ozempic, HOA liens, rug-pulls).

### 3.1 FRAT HOUSE
*Cargo shorts, backwards cap. Zero fear, zero GPA.*
- Kill: "BRO. Did you SEE that?!" / "Rush week is OVER for you." / "That's going on the frat Instagram!"
- Headshot: "DOME! Like a beer pong ball!"
- Revenge: "Remember me, pledge?"
- Shutdown: "Streak's over. Back to the kiddie table."
- Melee: "High five! TO THE FACE!"
- Humiliated: "Bro... did you just slap me?"
- Double: "DOUBLE! Chug! Chug!"
- Triple: "TRIPLE! The boys are watching!"
- Rampage: "RAMPAGE! Legend status: CONFIRMED."
- Reload: "Reloading! Somebody hold my— just hold this."
- Spotted: "Contact! Twelve o'clock!"
- Low health: "I need a medic! Or a nap!"
- Objective: "DISH SECURED!"
- Enemy streak: "They're on a streak! Not it!"
- Last alive: "All on me? The boys believe!"
- Round start: "Let's RAGE!"
- Own streak: "PIZZA PARTY INCOMING!" [S: "KEG STAND INCOMING!"]
- First Blood: "FIRST BLOOD! First beer! SAME ENERGY!" [S keeps; Clean: "FIRST BLOOD! First slice! SAME ENERGY!"]
- Self-kill: "That was... on purpose. Obviously."

### 3.2 BRAIN ROT
*iPad kids. 2026 slang, monthly live-ops voice patch. Skibidi is vintage.*
- Kill: "67! 67!" / "Aura minus ten thousand." / "Mogged!"
- Headshot: "FRAMEMOGGED!"
- Revenge: "41."
- Shutdown: "Your streak is so chud."
- Melee: "Mogged! Up close!"
- Humiliated: "I'm crashing out..."
- Double: "Double 67!"
- Triple: "Triple! 67! 67! 67!"
- Rampage: "RAMPAGE! SIGMA!"
- Reload: "Reloading! Hold my aura!"
- Spotted: "Chud spotted!"
- Low health: "My aura's fading..."
- Objective: "Objective secured! 67!"
- Enemy streak: "They're aura farming! STOP THEM!"
- Last alive: "Last one standing. Solo sigma."
- Round start: "67! LET'S GO!"
- Own streak: "AURA NUKE!"
- First Blood: "FIRST 67!"
- Self-kill: "That was... not sigma."
- **Live-ops:** first Tuesday monthly voice patch with the month's slang, marketed as "this month's brain rot update."

### 3.3 VALLEY GIRLS
*2026 toxic therapy-speak. Boundaries, manifesting, muting.*
- Kill: "You're violating my boundaries." / "I'm gatekeeping this objective." / "That's so toxic of you?"
- Headshot: "Blocked. And reported."
- Revenge: "I kept the receipts, bestie."
- Shutdown: "Your era is over. Muted."
- Melee: "Ew! Consent!"
- Humiliated: "I need to process this."
- Double: "Double! That's self-care!"
- Triple: "Triple! I'm thriving!"
- Rampage: "RAMPAGE! Main character energy!"
- Reload: "Reloading! Give me space!"
- Spotted: "Red flag at twelve o'clock?"
- Low health: "My boundaries are collapsing!"
- Objective: "This objective is MINE. I manifested it."
- Enemy streak: "She's doing the most!"
- Last alive: "Fine. My own healing arc."
- Round start: "Let's set intentions!"
- Own streak: "My followers are WATCHING!"
- First Blood: "First blood! That's a boundary!"
- Self-kill: "That was a choice. A bad one."

### 3.4 OLD MONEY
*Geriatric country club. Monocles, ascots, frail posture, infinite wealth. (Aged up from v2's Country Club so Frat stays young.)*
- Kill: "Do you KNOW who my father was?!" / "Back in MY day, we dueled properly." / "Consider yourself disinherited."
- Headshot: "A clean shot. Like my portfolio."
- Revenge: "I remember everything. I'm old."
- Shutdown: "The trust has been... dissolved."
- Melee: "A cane! To the shin!"
- Humiliated: "In my day, we had RESPAWN ETIQUETTE."
- Double: "Double! Like my scotch!"
- Triple: "Triple! The club approves!"
- Rampage: "RAMPAGE! Tell the papers!"
- Reload: "Reloading... these hands aren't what they were."
- Spotted: "Ruffians on the green!"
- Low health: "My hip! My other hip!"
- Objective: "Ours. As is everything. Deed's in the safe."
- Enemy streak: "Young people. So energetic. So rude."
- Last alive: "One gentleman against the rabble. As usual."
- Round start: "Gentlemen. Start your... whatever this is."
- Own streak: "CALL MY PILOT!"
- First Blood: "First blood! Like the old days!"
- Self-kill: "I've fallen... and I can't get up."

### 3.5 REDNECKS
*Specific, not greeting-card: catalytic converters, HOA beef, squatted trucks, Tannerite.*
- Kill: "YEEHAW!" / "Catalytic converter's MINE now!" / "Tannerite'd!"
- Headshot: "Right 'tween the eyes!"
- Revenge: "I remember you. From last time."
- Shutdown: "Streak's done. Like my truck's warranty."
- Melee: "Wrassled!"
- Humiliated: "Well, butter my biscuit."
- Double: "DOUBLE! Like my lift kit!"
- Triple: "TRIPLE! Mama's proud!"
- Rampage: "RAMPAGE! YEEHAW!"
- Reload: "Reloadin'! Don't touch my truck!"
- Spotted: "We got company, y'all!"
- Low health: "Hurtin' worse than tax season."
- Objective: "Got it! The HOA can't have it!"
- Enemy streak: "They're squattin' on our streak!"
- Last alive: "Just me? Born ready."
- Round start: "Let's go huntin'!"
- Own streak: "Releasin' the hounds!"
- First Blood: "FIRST BLOOD!"
- Self-kill: "Hair trigger. Like my temper."

### 3.6 KARENS
*The haircut. The coupons. The manager is on line two.*
- Kill: "I want to speak to your MANAGER!" / "Consider yourself REPORTED." / "One-star. Would not respawn."
- Headshot: "Headshot! Going in the review!"
- Revenge: "I REMEMBER you."
- Shutdown: "Your manager's been notified."
- Melee: "Let me show you the door!"
- Humiliated: "This is UNACCEPTABLE."
- Double: "Double! I'm telling BOTH your mothers!"
- Triple: "Triple! Corporate hears about ALL of you!"
- Rampage: "RAMPAGE! I AM the manager now!"
- Reload: "Reloading! I have 47 coupons!"
- Spotted: "Excuse me?! EXCUSE me?!"
- Low health: "I know my rights!"
- Objective: "MINE. I was here first."
- Enemy streak: "This is harassment!"
- Last alive: "Fine. I'll do it MYSELF."
- Round start: "Let's get this sorted!"
- Own streak: "I've called EVERYONE'S manager!"
- First Blood: "FIRST complaint! I mean— FIRST blood!"
- Self-kill: "I demand a refund on that grenade!"

### 3.7 GYM RATS
*Protein shaker, chest day, framemogs everyone by standing near them.*
- Kill: "LIGHT WEIGHT, BABY!" / "Do you even aim, bro?" / "GAINS!"
- Headshot: "FRAMEMOGGED!"
- Revenge: "You caught me on rest day. Never again."
- Shutdown: "Your streak skipped leg day."
- Melee: "Close-grip! To the face!"
- Humiliated: "I wasn't warmed up..."
- Double: "DOUBLE! Superset!"
- Triple: "TRIPLE! Drop set of DEATH!"
- Rampage: "RAMPAGE! BEAST MODE!"
- Reload: "Reloading! Rest between sets!"
- Spotted: "Cardio time!"
- Low health: "Spot me! SPOT ME!"
- Objective: "MINE. Called dibs. With my chest."
- Enemy streak: "They're on MY streak!"
- Last alive: "One rep left. One kill left."
- Round start: "CHEST DAY!"
- Own streak: "PRE-WORKOUT KICKING IN!"
- First Blood: "FIRST BLOOD! First PR!"
- Self-kill: "Failed PR."

### 3.8 THEATER KIDS
*Redirected: less Shakespeare, more reality-TV reunion energy. (Reviewer was right — Shakespeare doesn't clip for 14-year-olds.)*
- Kill: "And... SCENE!" / "The reunion starts NOW." / "I'm not here to make friends!"
- Headshot: "Dramatic! Close-up! DEATH!"
- Revenge: "You voted me out. Big mistake."
- Shutdown: "Your storyline is OVER."
- Melee: "The ol' stage slap!"
- Humiliated: "That was NOT in the script!"
- Double: "Double! Give them an Emmy!"
- Triple: "Triple! A TRIUMPH!"
- Rampage: "RAMPAGE! Get this player a TONY!"
- Reload: "Intermission!"
- Spotted: "Enter, stage left: victim."
- Low health: "I'm dying... beautifully..."
- Objective: "The objective! MINE! *bows*"
- Enemy streak: "They're stealing my spotlight!"
- Last alive: "A one-person show. My dream."
- Round start: "Places, everyone!"
- Own streak: "STANDING OVATION INCOMING!"
- First Blood: "FIRST BLOOD! Opening night!"
- Self-kill: "That death was... interpretive."

### 3.9 SOUNDCLOUD RAPPERS
*Homage slot. Battle-rap energy, ad-libs, no real names, no real cities, no violence references.*
- Kill: "BOW!" / "You got bodied!" / "That's a hit! Single droppin'!"
- Headshot: "*airhorn* HEADSHOT!"
- Revenge: "Run it back!"
- Shutdown: "Your streak? Canceled."
- Melee: "Hands up! Down you go!"
- Humiliated: "Ayo... that was foul."
- Double: "Double up!"
- Triple: "Triple! Fire!"
- Rampage: "RAMPAGE! Lil Rampage!"
- Reload: "Reloading! DJ, run it!"
- Spotted: "Hater spotted!"
- Low health: "I'm hit! Where's my engineer?!"
- Objective: "Took it! Album cover material!"
- Enemy streak: "They going platinum! Stop the press!"
- Last alive: "Solo track. My best work."
- Round start: "Let's get this bread!"
- Own streak: "FEATURE ALERT! Airstrike!"
- First Blood: "FIRST BOW!"
- Self-kill: "Mix was too hot. Grenade too."

### 3.10 VC BROS
*Merged Tech + Crypto (reviewer was right — indistinguishable at 50 paces). Patagonia vest, charts, rug-pulls.*
- Kill: "I'm disrupting the kill feed." / "You've been sunsetted." / "That's a market correction. You're the market."
- Headshot: "Precision-targeted. Like our ads."
- Revenge: "Revenge is best served... funded."
- Shutdown: "Your streak got liquidated."
- Melee: "Let's take this offline."
- Humiliated: "Not in the roadmap."
- Double: "Double! 2x growth!"
- Triple: "Triple! We're scaling!"
- Rampage: "RAMPAGE! Unicorn status!"
- Reload: "Reloading! Async!"
- Spotted: "I see a blocker!"
- Low health: "My equity can't save me."
- Objective: "Captured. Adding to the sprint."
- Enemy streak: "They're outperforming! PIVOT!"
- Last alive: "Sole contributor."
- Round start: "Move fast, break things!"
- Own streak: "Series C deployed! Airstrike!"
- First Blood: "FIRST BLOOD! First-mover advantage!"
- Self-kill: "That was... a pivot."

### 3.11 HOA DADS *(new)*
*Cargo shorts, white New Balances, lawnmower obsession, measures grass with a ruler. The Karen's natural enemy.*
- Kill: "VIOLATION!" / "The HOA sends its regards!" / "Your grass was 3 inches! Now you're 6 feet under!"
- Headshot: "Measured twice, shot once."
- Revenge: "I remember your fence. And now you."
- Shutdown: "Your streak violates section 4, paragraph 2."
- Melee: "Get off my lawn! Physically!"
- Humiliated: "This is going in the newsletter."
- Double: "Double! Like my property values!"
- Triple: "Triple! The neighborhood watch approves!"
- Rampage: "RAMPAGE! For the community!"
- Reload: "Reloading! Like my mower! Pull start!"
- Spotted: "Unapproved visitor on the greenbelt!"
- Low health: "My back! My beautiful back!"
- Objective: "COMMON AREA. Mine."
- Enemy streak: "Filing a complaint with the board!"
- Last alive: "One dad. One grill. One mission."
- Round start: "Mow the competition!"
- Own streak: "The board has approved... AN AIRSTRIKE."
- First Blood: "FIRST BLOOD! First on the block!"
- Self-kill: "That was NOT up to code."

### 3.12 EMO KIDS
*Kept, redirected: LOUD-deadpan. Screamed nihilism carries over gunfire; mumbled nihilism doesn't.*
- Kill: "I'M FINE!" / "This changes nothing!" / "Another one for the playlist!"
- Headshot: "HEADSHOT! My Chemical Romance is SCREAMING!"
- Revenge: "I wrote a song about you. It's called REVENGE."
- Shutdown: "Your happiness: CANCELED."
- Melee: "Hug! With a KNIFE!"
- Humiliated: "Even my death is mid."
- Double: "DOUBLE! The void doubles!"
- Triple: "TRIPLE! Scream it back!"
- Rampage: "RAMPAGE! I'M NOT OKAY!"
- Reload: "Reloading! Everything ends! Including mags!"
- Spotted: "Oh GREAT. People."
- Low health: "Bleeding out! FINALLY something real!"
- Objective: "Took it. It won't fix me."
- Enemy streak: "They're happy. DISGUSTING."
- Last alive: "Alone. As it should be."
- Round start: "Let's get this OVER WITH!"
- Own streak: "THE DARKNESS HUNGERS!"
- First Blood: "FIRST BLOOD! First cut! Deepest!"
- Self-kill: "That was... on brand."

## 4. Rivalry lines (marquee matchups — no joke-explaining, 1.8s max)

- Karen kills Theater Kid: "The show is CANCELED."
- Theater Kid kills Karen: "Curtain! No encore!"
- Frat kills Emo: "Smile, bro!"
- Emo kills Frat: "Your joy was rented."
- Brain Rot kills Karen: "OK KAREN!"
- Karen kills Brain Rot: "I'm confiscating that tablet!"
- Gym Rat kills VC Bro: "Your standing desk can't save you!"
- VC Bro kills Gym Rat: "Automated your job. It's dying."
- Old Money kills Redneck: "The groundskeepers will remove you."
- Redneck kills Old Money: "Y'all pay HOW much for golf?!"
- HOA Dad kills Karen: "I AM the HOA."
- Karen kills HOA Dad: "I'll have YOUR job!"
- SoundCloud kills Valley: "You're muted, bestie!"
- Valley kills SoundCloud: "Your mixtape? Never heard of her."
- (Production writes the remaining 52 directional pairs.)

## 5. System event lines (examples — full set in production)

- **Killstreak destroyed:** Frat "They killed the party!"; Karen "I'm calling the FAA!"; generic announcer: "Helicopter down!"
- **Camping snitch (20s in 3m):** Karen "I am NOT loitering, I have a receipt!"; Frat "I'm not camping, I'm strategizing!"; Emo "I'm not camping. Just... sitting. Forever."
- **Post-match MVP:** announcer in MVP's faction voice.
- **Bottom-fragger roast:** "And [name] went 2-and-18. Participation trophy's in the mail." / Karen: "Someone's getting a performance review." / Brain Rot: "2-and-18 is NOT very 67."
- **Friendly fire:** faction "Watch it!" bark (if FF enabled).

## 6. Game modes (6)

| # | Mode | Parent | Skin |
|---|---|---|---|
| 1 | Cul-de-Sac Clash | TDM | Default brawl. |
| 2 | HOA Patrol | Domination | Hold the pool, clubhouse, gazebo. |
| 3 | Every Suburb for Itself | FFA | Pure chaos. |
| 4 | Steal the Casserole | CTF | Grab the dish, bring it home. |
| 5 | Evict the Block | Search & Destroy | Post the notice / tear it down. One life. |
| 6 | Receipt Check | Kill Confirmed | Kills drop receipts. Karen territory. |

## 7. Killstreaks

- **3 — "The Snitch"** (recon): Karen "called the manager," VC "scheduled a meeting," Brain Rot "told the teacher."
- **5 — "Dad's Helicopter"** (attack run): Old Money's "CALL MY PILOT" canonical.
- **7 — "The Audit"** (precision strike): VC "the IRS is here," Karen "corporate is coming."
- **9 — "Grounded"** (enemy debuff): Theater "intermission," Emo "existential dread."
- **11 — "Total Subdivision Destruction."**

## 8. Maps (6) — Ridgeview High CUT (school + guns = ban). Replaced:

1. **The Country Club** — golf course, hedge mazes. Long sightlines.
2. **Mega-Mart** — big-box store: aisles, garden center, parking lot. Chokepoints + verticality. *(replaces school)*
3. **The Marina** — yachts, docks, below-deck corridors. CQB chaos.
4. **Cul-de-Sac** — signature map: suburban street, garages, trampolines.
5. **The Mall** — food court, escalators. Verticality.
6. **Lake House Weekend** — docks, pines. Sniper ridgelines.

## 9. Weapons, loadouts, progression

- Pre-match loadouts: primary, secondary, perk, equipment.
- 8 launch weapons: "The Allowance" (AR), "The Side Hustle" (SMG), "The Divorce Settlement" (shotgun), "The Trust Fund" (sniper), "The Subdivision" (LMG), "The Permit" (pistol), "The Lawsuit" (launcher), "The Participation Trophy" (melee).
- Attachments via weapon challenges; faction skins via kills.
- Bots fill lobbies.
- **Quality bar:** tight spawns, crisp hitreg, fair TTK. "Better than CoD" clips are the goal — HW2 got dinged on spawn camping; we don't repeat it.

## 10. Art direction (v4 — LOCKED): hybrid retro

**The look:** 16-bit, per the concept mockup (visual target: https://drive.google.com/file/d/1mRaXhs0-r5BFmsaKjyvw5AI5RkymlnLd/view?usp=drivesdk). Chunky pixels, bright suburban palette, comic "POW!" hit markers, speech-bubble barks, kill feed with joke player names, weapon-card ammo UI.

**The build (hybrid, not sprites):** low-poly 3D characters with pixel-art textures, rendered through a low-res render target with point-filter upscaling + a limited-palette shader. Screenshots look 16-bit; the game plays like a real 3D shooter — real hitboxes, true vertical aim, ragdolls flopping down the Mega-Mart aisles. No 8-angle sprite sheets, no billboard warping. This is standard indie-retro technique in Unity/Godot: modest cost, not R&D. (The mockup's flat billboard look is the *visual target*, not the engine spec.)

**8-bit** is reserved for menus, icons, HUD chrome, and chiptune — never characters. Faction readability at a glance is the comedy engine; 8-bit erases the Karen haircut and the iPad glow.

**Why not realism:** costs far more, invites direct comparison with HW2's UE5 look, and cute-pixel-Karen screaming about the manager is funnier than a realistic one. The art/voice contrast is part of the joke.

**Platform split (important):** Roblox doesn't support custom screen shaders, so the Roblox prototype gets the low-poly models + pixel textures WITHOUT the low-res palette render — close, but cleaner-looking than the vision. The full 16-bit effect is Steam-only (Unity/Godot). Judge the concept by the mockup, not the prototype's visuals.

## 11. Audio: human voices

- ~230 lines per script × 2 scripts (Clean + Steam). **Human VAs, not AI** — comedic timing, voice cracks, and chaotic screaming are the product, and AI TTS can't do them. Plan: 6 hungry indie VAs / funny TikTok creators, ~$150 each for an hour of screaming. Bonus: they promote the game.
- Monthly brain-rot patch: retain 1–2 creators on a small retainer.
- Faction announcers, chiptune soundtrack, faction killstreak stingers. Everything mutable.

## 12. Two scripts (not word-swaps)

- **Clean (Roblox):** funny within moderation. Constraints breed creativity.
- **Steam:** vicious hyper-specific social satire — Zyn pouches, Ozempic, HOA liens, fake service dogs, rug-pulls, screen-time passcodes. Written as distinct jokes, not find-replace.
- Marked [S] inline where they diverge; full Steam script is a production deliverable.

## 13. Viral design

- Killcam line playback to the victim — the 3-second clip.
- 3–5 min rounds, killcam always on.
- Rivalry-of-the-week matchmaking rotation.
- **Clip export: Steam-only** (Roblox's Luau sandbox can't burn captions to MP4 — v2 was wrong; Roblox relies on native OS recording).
- Streamer kit: voice-line soundboard, faction picker overlay, clip contest. Seed to FPS creators early.
- Positioning: "The game that roasts everyone (including you)."
- Monthly brain-rot patch = recurring marketing beat.

## 14. Platform & monetization

- **Prototype: Roblox.** Free-to-play; game passes (faction slots, announcer packs), cosmetic skins, kill-effect packs. No pay-to-win, ever.
- **Steam: $5.99** impulse tier. Voice-pack DLC, skin bundles. Cosmetics only.
- Prove the loop on Roblox, then decide if Steam earns its build cost.

## 15. Scope & phasing

- **Phase 0:** 1 map (Cul-de-Sac), 2 modes (Clash, Receipt Check), 4 factions — **Karens, Brain Rot, Frat House, SoundCloud Rappers** (reviewer was right: quiet doesn't clip; Emo sits out). Bots. Prove the loop. NOTE: the Roblox prototype will use the low-poly models + pixel textures but can't do the low-res palette render — it proves gameplay and comedy timing, not the final look.
- **Phase 1:** 6 maps, 6 modes, 12 factions, progression, killstreaks, rivalry lines, clip export.
- **Phase 2:** seasonal faction drops, community-voted maps, ranked rivalries, monthly brain-rot patches.

## 16. Open questions (v3 — next review)

1. Does the low-poly 3D pivot actually solve the comedy-physics problem, or does it balloon scope past what a small team ships? What's the real art cost?
2. Which faction is still the weakest link — who gets cut if we need 11?
3. Two scripts (Clean + Steam): sane economics, or does it double voice costs for no reason? Any lines that only work in one script?
4. Legal/cultural check round 2: any lines still risky? (Trademark, real-person, or "punching down" audit.)
5. Title: "Call of Karen: HOA Warfare" — does the Call of Duty parody survive trademark scrutiny? Better options?
6. What's still most likely to kill this game?
7. The camping self-snitch: brilliant or annoying? Will players game it or love it?
8. Monetization blind spots?
