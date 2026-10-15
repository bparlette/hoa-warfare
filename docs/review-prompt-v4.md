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
