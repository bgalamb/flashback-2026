import { fusebox, pluginLink } from 'fuse-box';
import * as fs from 'fs'
import { exec } from 'child_process'

const fuse = fusebox({
  entry: ['src/index.ts'],
  target: 'browser',
  devServer: {enabled: true, httpServer: {port:4445}},
  webIndex: {
    template: './index.html'
  },
  sourceMap: {
    vendor: true,
    project: true,
    css: true,
  },
});

fuse.runDev()

exec('mkdir -p dist/js && cp -r src/audio-processors.js dist/js/processors.js')

exec('mkdir -p dist/DATA && cp -R DATA/* dist/DATA/')

// // I'm sure there's a way to do it with sparky (or whatever it is called)
// // but I couldn't find a single example on how to do it in the whole
// // fuse-box repo... sigh... So desperate times call for desperate measures ;)
// fs.watch("src/audio-processors.js", (eventType, filename) => {
//   exec('mkdir -p dist/js && cp -r src/audio-processors.js dist/js/processors.js')
// });

fs.watch("DATA", { recursive : true }, (eventType, filename) => {
  exec('mkdir -p dist/DATA && cp -R DATA/* dist/DATA/')
});
