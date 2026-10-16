// Portal integration. On CrazyGames this wraps their HTML5 SDK v3 (https://docs.crazygames.com/sdk/);
// everywhere else every call is a harmless no-op, and no third-party script is loaded.
//
// What CrazyGames requires of multiplayer games (docs.crazygames.com/requirements/multiplayer/):
//   * invites and room status go through the SDK (inviteLink, updateRoom/leftRoom, join-room listener)
//   * show the player's CrazyGames username in game
//   * Instant Multiplayer: when the flag is set, launch straight into a private, joinable room
//   * round-based games keep the group together between rounds (our rooms restart in place)
// Plus the general rules: report gameplayStart/Stop, and store links only on the main menu on desktop.

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

export class Portal {
  /** @param {string} name from funnel.detectPortal(): 'crazygames' | 'itch' | 'newgrounds' | 'github' | 'local' */
  constructor(name, { win = typeof window !== 'undefined' ? window : null, doc = typeof document !== 'undefined' ? document : null } = {}) {
    this.name = name;
    this.win = win;
    this.doc = doc;
    this.sdk = null;          // window.CrazyGames.SDK once ready
    this.playing = false;
    this.ready = Promise.resolve(false);
  }

  get isCrazyGames() { return this.name === 'crazygames'; }

  /** Load and init the CrazyGames SDK (no-op elsewhere). Resolves true when the SDK is usable. */
  init() {
    if (!this.isCrazyGames || !this.win || !this.doc) return this.ready;
    this.ready = (async () => {
      try {
        if (!this.win.CrazyGames?.SDK) {
          await new Promise((resolve, reject) => {
            const s = this.doc.createElement('script');
            s.src = SDK_URL;
            s.onload = resolve;
            s.onerror = reject;
            this.doc.head.appendChild(s);
          });
        }
        const sdk = this.win.CrazyGames.SDK;
        await sdk.init();
        if (sdk.environment === 'disabled') return false;
        this.sdk = sdk;
        return true;
      } catch (err) {
        console.warn('CrazyGames SDK unavailable; continuing without it', err);
        return false;
      }
    })();
    return this.ready;
  }

  call(fn) {
    if (!this.sdk) return undefined;
    try { return fn(this.sdk); } catch (err) { console.warn('CrazyGames SDK call failed', err); return undefined; }
  }

  // ---------------------------------------------------------------- lifecycle (required)
  loadingStart() { this.call(s => s.game.loadingStart()); }
  loadingStop() { this.call(s => s.game.loadingStop()); }
  /** Call when the player is actually playing (match running, not paused or in a menu). */
  gameplayStart() { if (!this.playing) { this.playing = true; this.call(s => s.game.gameplayStart()); } }
  gameplayStop() { if (this.playing) { this.playing = false; this.call(s => s.game.gameplayStop()); } }
  /** A moment of joy (win, MVP): lets CrazyGames time its own celebrations / ads around it. */
  happytime() { this.call(s => s.game.happytime()); }

  // ---------------------------------------------------------------- user
  /** CrazyGames username when the player is logged in there, else null. */
  async username() {
    if (!this.sdk) return null;
    try {
      if (!this.sdk.user?.isUserAccountAvailable) return null;
      const u = await this.sdk.user.getUser();
      return u?.username || null;
    } catch { return null; }
  }

  // ---------------------------------------------------------------- multiplayer
  get instantMultiplayer() { return !!this.call(s => s.game.isInstantMultiplayer); }
  /** Room code the player was invited to (CrazyGames invite link), else null. */
  invitedRoom() { return this.call(s => s.game.getInviteParam('room')) || null; }
  /** CrazyGames-hosted invite URL for a room (null when not on CrazyGames). */
  inviteLink(room) { return this.call(s => s.game.inviteLink({ room })) || null; }
  /** Tell CrazyGames which room we are in and whether friends can still join it. */
  updateRoom(room, joinable) { this.call(s => s.game.updateRoom({ roomId: room, isJoinable: !!joinable, inviteParams: { room } })); }
  leftRoom() { this.call(s => s.game.leftRoom()); }
  /** Friend clicked "join" in the CrazyGames UI while the game is already open. */
  onJoinRoom(cb) {
    this.call(s => s.game.addJoinRoomListener(params => {
      const room = params?.room ?? params?.inviteParams?.room ?? params?.roomId;
      if (room) cb(String(room));
    }));
  }
}
