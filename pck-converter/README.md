# Pck Converter for JoiPlay

A self-contained runtime shim that makes some Godot games exports, run under [JoiPlay](https://github.com/joiplay) under Android. _No game content is rewritten._

> You **must** own your game.
>
> Backup your saves is a _should do_.

_supports_:

- Godot 3/4 maybe

## Why?

Some Godot games ship as one self-contained `.exe` with the game data glued onto the end. JoiPlay looks for a separate `.pck` file, finds none, and refuses to launch the game, with `this game type is not supported` prompt even though it is a Godot game that JoiPlay could route.

This tool cuts the glued-on part off and saves it as a `.pck`, plus a stub `.exe` who acts as JoiPlay's entry point, in a sibling folder of the original game folder.

This way, this tool don't alter your own game.

## Get it to work

- You will need python(3)

```bash
 python3 pck_converter.py #  (...)
```

### Scan first

- list .exe files in a game directory

```bash
 python3 pck_converter.py scan
```

### Detect

> The godot engine format of the executable,
>
> whether the .exe is an embedded pack or not

```bash
 python3 pck_converter.py detect [game-dir/game.exe] # you must point to the executable
```

### Extract

> Write to a sibling folder, the `.pck` which is the game data, and a placeholder `.exe` for the entry point to JoiPlay

```bash
 python3 pck_converter.py extract [game-dir/game.exe] # you must point to the executable
```
