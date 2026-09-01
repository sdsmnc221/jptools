# Pck Converter for JoiPlay

Extracts the Godot `.pck` hidden inside a self-containerd Windows `.exe`, so [JoiPlay](https://joiplay.net/) can recognize the game.

```bash
python3 pck_converter.py extract "MyGame/MyGame.exe"
```

_writes MyGame_patch/MyGame.pck. Never modifies the original_

> You **must** own your game.
>
> Backup your saves is a _should do_.

---

## Requirements

Python 3.10+. No dependencies.

---

## Why?

JoiPlay detects a Godot game by looking for a `.pck` file in the folder. A self-contained `.exe` has the pack glued on the end, so JoiPlay sees nothing and the game will not import. Extracting it is not an optimization, it is the only way the game registers as Godot.

---

## Get it to work

- You will need python(3)

```bash
 python3 pck_converter.py #  (...)
```

- Or you can use via provided shebang

```bash
chmod +x ./pck_converter.py
./pck_converter.py -h
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

---

## Disclaimers

```text
These tools read files you already have and write only to a new <game>_patch/ folder beside the game. They never modify the game.

This repository contains no game data - no data.win, no .pck, no APKs, no patch bytes. Every tool operates on your own copy of a game you own.

Not affiliated with Godot Engine, or JoiPlay.
```

See [License](./License.md)
