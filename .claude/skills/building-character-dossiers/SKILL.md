---
name: building-character-dossiers
description: Use when producing or refreshing an offline HTML report for a Path of Exile build, drawing its passive tree or ascendancy, or turning analysis findings into a page the player keeps.
---

# Building Character Dossiers

A dossier is one self-contained HTML file. It shows what the character is, what
it is going for, and what to do next. Use `analyzing-pob-builds` for the analysis
itself; this skill covers turning the findings into a page.

## Generate from the build

Never type an allocation, a stat, or a gem level into the page. It goes stale the
next time the player saves. Draw the passive tree from the build file:

```bash
npm run build
npm run dossier:tree -- --build "/path/to/Build.xml" --out ./dossier
```

The script reads the tree version, class, ascendancy, and allocated nodes from
the build's active spec. `--spec N` selects another spec. Node positions and
icons come from that tree version's `TreeData` in the PoB the server uses
(`POB_PATH`, else an installed app). A PoB without that tree version is an error.

| Option | Effect |
|---|---|
| `--planned id,id` | Marks ascendancy nodes the player intends to take, numbered in order |
| `--icons` | Embeds PoB's icon sheets (about 2 MB); trees before 3.19 have no local sprite data |

It writes `tree.svg`, and `ascendancy.svg` when the spec has an ascendancy. The
SVGs use `currentColor`, `--accent`, and `--ground`; set them in the page's CSS.
Node IDs that are not on the spec's tree, such as cluster jewel nodes, are listed
as skipped.

## Check the rendering before sharing

The tree's viewBox is thousands of units wide and is read at page width, so
detail that looks fine in markup can render at a few pixels. Rasterize and look:

```bash
rsvg-convert -w 1400 -b '#14120f' preview.svg -o preview.png
```

`rsvg-convert` does not resolve CSS custom properties. Replace `var(...)` and
`currentColor` with concrete colors in the preview copy only.

## Keep each panel to a decision

The player already has PoB open. Each panel answers one of three questions: what
is this character, what is it going for, what does it do next. A panel that only
repeats a PoB screen hides the answers. Name the decision a panel supports. A grid
of every socket group supports none; the finding inside it ("the selected group
is a gem level behind its copy, worth 25% DPS") does. Keep the finding and its
measurement, and cut the grid.

## Keep GUI absolutes apart from engine deltas

The headless engine and the PoB window can disagree. On one measured character,
the engine reported 4,417,036 DPS and the window 4,148,600 (cast speed 10.6
against 10.35). PoB writes the window's values into the build at save time:

```bash
grep -o '<PlayerStat value="[0-9.]*" stat="CombinedDPS"/>' Build.xml
```

Take absolute figures from `<PlayerStat>` and changes from engine runs, as
percentages. Do not mix the two in one row. Say once on the page which is which.
If the engine baseline changes between identical runs, stop and find out why
before building on it.

## Items and prices

Render item text with a tooltip library, not hand-built markup.
[poe-item-render](https://github.com/rchasman/poe-item-render) parses both game
clipboard text and PoB export text. Game artwork and the Fontin typeface are not
redistributable: a page kept locally may embed them, and a page shared publicly
should use artwork-free styles and follow the font's licence terms.

Price decisions with the server's market tools (`get_currency_rates`,
`search_trade_items`) and follow the pricing rules in `analyzing-pob-builds`.
Rank options by value per chaos as well as raw gain, and stamp the league and the
fetch date next to every price.

## Page order

1. Header: level, class, ascendancy, a short stat strip from `<PlayerStat>`
2. What the DPS figure is measured against (a pinnacle boss is not a map)
3. Tree, ascendancy, and the gear that matters to the findings
4. Findings, each with its measurement
5. Decisions, each priced in passive points or currency, cheapest first
6. Items the player has already handled

Label how each claim was obtained: measured by the engine, computed from an
assumption (state the assumption), or a judgement. Include measured negatives,
such as an apparent upgrade that is not one.

## Updating an existing dossier

Reload the build and compare it with the numbers on the page. Regenerate the tree
and any other generated parts. Move finished items to the handled list instead of
deleting them, and rewrite any recommendation the player has already acted on.

## Before sharing

- The page is self-contained: no `src` or `href` starts with `http`.
- Every `href="#x"` has a matching `id="x"`, and tags are balanced.
- The rasterized tree and ascendancy previews look right.
