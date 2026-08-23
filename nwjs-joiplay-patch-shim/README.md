# nwjs-shim for JoiPlay

A self-contained runtime shim that makes NW.js game exports, run under [JoiPlay](https://github.com/joiplay) under Android. _No game content is copied or rewritten._

> You **must** own your game.
>
> Backup your saves is a _should do_.

_supports_:

- maybe Construct
- and/or maybe RPGMaker MZ

## Why this shim

### Games made with RPGMaker MZ.

![error process](./docs/Screenshot_20260822-223410.png)

On desktop the game runs under NW.js = Chromium + Nodejs, where `process` is a real Node-object.

> JoiPlay provides working `fs`, `path`, `process.cwd()`, `process.platform`, etc. -> A functioning filesystem bridge. `process` just happen to not land on the `on`, in some games, to which I believe because of scripts orders

### Games made with Construct (and more likely under Steam)

![black screen, steam module not working](./docs/CleanShot%202026-08-23%20at%2010.16.14@2x.png)

## Get it to work

_Tested on MacOS, stay cautious and well aware of `unzip` and `zip` native commands may not be universal._

### Install the CLI

```bash
pnpm shim-on
# or yarn, npm, npx, whatever you were using. This is under node.js with no additional package
```

### Detect (you can skip)

```bash
joiplay-shim detect [game-dir]
```

### Shim (will detect as well)

```bash
joiplay-shim install [game-dir] [options: --dry-run]
```

### Patch

1. `patch.rga` is produced in a sibling `[game-dir]_patch/` directory.
2. You copy this patch to the device along with your _own_ copy of the game.
3. Add your _own_ game via JoiPlay.
4. Long press the game shorcut -> Patch with RGA.
5. Locate your .rga patch then hit OK.

### How this shims

> Delivers a `.rga` patch.

`.rga` is JoiPlay's own game-archive format (see [github.com/joiplay/rga](https://github.com/joiplay/rga)): a **zip** containing game files plus a `game.cfg` manifest. Its documented parameters are `title`, `id`, `execFile`, `icon`, `version`, `type` \_\_ where `type` is one of `html`, `renpy`, `rpgmmv`, `rpgmvx`, `rpgmvxace`, `rpgmxp`, `tyrano`, `construct`, `rgpmmz`.

JoiPlay _applies patch_ for NW.js game by unzupping an `.rga` over the game folder. `.rga` patch contains `patches.json` read by JoiPlay. It provides a string table lookup so JoiPlay can apply string replacements to every text files it serves, before WebView parses it.

**Pure addition is this patcher/shim**: `game.cfg` + `patches.json` (+ `shim.js` when new code is needed), delivered as one `.rga` patch. No game file is renamed, no `package.json` edited, no entry HTML overwritten. Uninstall is deleting those files. Steam's "verify integrity" is unaffected, because nothing it tracks has changed. It survives game updates, because it matches strings rather than pinning file hashes.
