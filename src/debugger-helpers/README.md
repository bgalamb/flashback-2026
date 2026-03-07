```
npm install

npm run export:palette -- ./DATA/level1.pal ./out/level1-palette.ppm
npm run export:mbk -- /path/to/real-data.mbk ./out/data-tiles.ppm
npm run export:all-mbk -- /path/to/flashback-data ./out/mbk-tiles
npm run export:all-palette -- ./DATA ./out/palette-images
npm run export:bnq -- ./DATA/level1.bnq ./out/level1-tiles.ppm
npm run export:all-bnq -- ./DATA ./out/bnq-tiles
npm run export:bnq -- ./DATA/level1.bnq ./out/level1-tiles-p1.ppm ./DATA/level1.pal 1 16
npm run export:cutscene:id -- /path/to/flashback-data 47 ./out/cutscene-47.avi
npm run export:cutscene:name -- /path/to/flashback-data INTRO ./out/intro.mpg
npm run export:cutscene:name -- /path/to/flashback-data INTRO ./out/intro-offset.mpg 1234

```
