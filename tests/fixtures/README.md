# Smoke test fixtures

## occ-vortex.xml

A level 99 Occultist with a full set of gear and an allocated tree. The smoke
tests need a geared build: `example-build.xml` in the repo root has no items, so
it cannot exercise `find_best_anointment` or the weighted trade query, both of
which read amulet mods.

Copied verbatim from [Path of Building
Community](https://github.com/PathOfBuildingCommunity/PathOfBuilding)
(`spec/TestBuilds/3.13/OccVortex.xml`, MIT licensed). It lives here so the smoke
tests run against an installed PoB, which ships no `spec/` directory.

Keep it byte-identical to the revision it came from, so the assertions keep
meaning what they mean upstream:

- upstream commit `f738bf343a5c06687caa57c63adecc6cd6342b57` (2021-12-08)
- `sha256 fb53e38e853a95db7ba1b5b14c66e86123b2c66f78f4ed9151ba57b36adb5dfc`

Do not add an XML comment for attribution: that is what this file is for.
