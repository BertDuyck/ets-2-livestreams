#!/usr/bin/env node
import { insertAfterName } from './sii.js';

const file = process.argv[2] || 'live_streams.sii';
const station = {
  url: 'https://streams.radio.dpgmedia.cloud/redirect/willy_be_class_x/mp3',
  name: 'Willy Class X',
  genre: 'Rock',
  lang: 'NL',
  bitrate: '',
  favorite: '0',
};

insertAfterName(file, station, 'Studio Brussel');
console.log(`Inserted ${station.name} after Studio Brussel and updated indices/count in ${file}`);
