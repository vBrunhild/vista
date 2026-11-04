# Vista: Theater of the Mind Strips

A Foundry VTT module for theater-of-the-mind play. Vista replaces the battle map with up to four narrative strips and arranges tokens inside them automatically.
Works very well with any system that doesn't need a grid.

Requires Foundry VTT v13.

## Installation

In Foundry's setup screen, go to **Add-on Modules**, click **Install Module**, paste this manifest URL into the field at the bottom and click **Install**:

```
https://github.com/vBrunhild/vista/releases/latest/download/module.json
```

To install by hand instead, download `module.zip` from the [latest release](https://github.com/vBrunhild/vista/releases/latest) and extract it into `Data/modules/vista`.

## Features

### Strips

Each scene can be divided into 1 to 4 strips, stacked as rows or placed side by side as columns.

- Strips can have labels, shown in the top left corner of each strip.
- Divider lines between strips can be shown or hidden, and their color, thickness and opacity are configurable.
- Left and right padding keeps strip content clear of artwork at the edges of the background.

### Automatic token layout

Tokens are placed and sized by Vista. There is nothing to position by hand.

- A token belongs to the strip it is dropped in. Dragging it into another strip moves it there.
- Tokens in a strip are sorted by name, or by turn order while combat is running.
- Each strip scales its tokens up as far as they fit, all by the same amount, so a 2x2 creature stays twice the size of a 1x1 character. Sizes come from each actor's prototype token, and tokens without an actor count as 1x1.
- Rows are centered, balanced and bottom-aligned, so tokens of different sizes stand on a shared line.
- Removing strips moves their tokens into the last remaining strip without forgetting where they were. Adding the strips back returns them.

### Locked view

The view is locked to fit the whole scene on screen for every player. It follows the sidebar as it opens and closes.

### Backstage

An optional GM-only area to the right of the scene, for staging NPCs before they enter.

- Tokens dropped in the backstage are hidden from players. Moving one into a strip reveals it.
- Tokens hidden for other reasons are never revealed by Vista.
- Only the GM's view includes the backstage. Players' views stay on the scene.
- The backstage lives in the scene's padding. Enabling it gives the scene 10% padding if it has none, and the padding sets how wide the backstage is.

### Status line

Each token can show a short line of text under it, such as "hiding behind the bar" or "bleeding".

- Edit it from the field above the token in its HUD (right-click the token), then press Enter.
- Anyone who owns a token can edit its status, so players can set their own.
- The text keeps a readable size on screen and hides along with its token.

## Setup

1. Enable the module in your world.
2. Open a scene's configuration and go to the **Vista** tab.
3. Check **Enable Strips Mode**, choose the number of strips and any other options, and save.

### Scene options

| Option | Description |
| --- | --- |
| Enable Strips Mode | Uses strips instead of a battle map on this scene. |
| Number of Strips | How many strips to divide the scene into, from 1 to 4. |
| Place Strips Side by Side | Uses columns placed side by side instead of rows stacked on top of each other. |
| Backstage Area | Adds the GM-only backstage to the right of the scene. |
| Strip Labels | Comma-separated labels, one per strip, for example `Bar, Common Room, Stage`. |
| Show Strip Lines | Shows the divider lines between strips. |
| Pad Left / Pad Right | Keeps strip content this many pixels away from the left and right edges. |

### Module settings

| Setting | Default | Description |
| --- | --- | --- |
| Strip Divider Color | Black | Color of the divider lines. |
| Strip Divider Thickness | 3 | Thickness of the divider lines, in pixels. |
| Strip Divider Opacity | 0.6 | Opacity of the divider lines, from 0 to 1. |
| Default Pad Left | 0 | Left padding for scenes that don't set their own. |
| Default Pad Right | 0 | Right padding for scenes that don't set their own. |
| Default Strip Lines Visible | On | Whether scenes show divider lines unless they set their own. |
| Debug Mode | Off | Logs extra information to the browser console. Set per player. |

### Keyboard shortcuts

These are GM-only and can be changed under **Configure Controls**.

| Shortcut | Action |
| --- | --- |
| `Shift` + `]` | Add a strip to the current scene (up to 4). |
| `Shift` + `[` | Remove a strip from the current scene (down to 1). |
| `Shift` + `\` | Show or hide the divider lines on the current scene. |

## Development

The module is plain JavaScript with no build step. Types come from [fvtt-types](https://github.com/League-of-Foundry-Developers/foundry-vtt-types) and are checked with TypeScript.

```sh
npm install
npm run typecheck
```

### Releasing

Publish a GitHub release with a tag like `v1.2.0`. The release workflow sets the version and download URL in `module.json` from the tag, packages the module into `module.zip` and attaches both files to the release.

# AI Usage Disclosure

LLMs were used to assist with coding, such as: reviewing, debugging and suggesting changes and fixes. Code was still mostly done by hand, read and tested by humans.
No other form of GenAI was used in this project nor will it be used.
