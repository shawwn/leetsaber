#!/usr/bin/env node
"use strict";

const fs = require('fs');
const path = require('path');

/* unity asset parser */

const _stream = data => {
  return {string: data, len: data.length, pos: 0}
}

const _peekChar = s => {
  if (s.pos < s.len) {
    return s.string[s.pos];
  }
}

const _readChar = s => {
  if (s.pos < s.len) {
    return s.string[s.pos++];
  }
}

const _newlines = {["\n"]: true, ["\r"]: true};
const _spaces = {["\t"]: true, [" "]: true};
const _whitespace = {["\n"]: true, ["\r"]: true, ["\t"]: true, [" "]: true};
const _delimiters = {["\n"]: true, ["\r"]: true, ["\t"]: true, [" "]: true};

const _skipNewlines = s => {
  while (_newlines[_peekChar(s)]) {
    _readChar(s);
  }
  return s;
}

const _skipWhitespace = s => {
  while (_whitespace[_peekChar(s)]) {
    _readChar(s);
  }
  return s;
}

const _skipSpaces = s => {
  while (_spaces[_peekChar(s)]) {
    _readChar(s);
  }
  return s;
}

const _countSpaces = s => {
  let n = 0;
  while (_peekChar(s) === ' ') {
    _readChar(s);
    n = n + 1;
  }
  return n;
}

const _isAtomChar = c => {
  return c && !_delimiters[c];
}

const _readAtom = s => {
  let atom = "";
  _skipSpaces(s);
  while (_isAtomChar(_peekChar(s))) {
    atom += _readChar(s);
  }
  return atom;
}

const _expected = (s, c) => {
  throw new Error(`Expected ${c} at ${s.pos+1}`);
}

const _readInteger = s => {
  return parseInt(_readAtom(s), 10);
}

const _readItem = s => {
  const level = _countSpaces(s);
  const i = _readInteger(s);
  const type = _readAtom(s);
  const name = _readAtom(s);
  let value = null;
  let children = null;
  _countSpaces(s);
  if (_readAtom(s) === '=') {
    _skipSpaces(s);
    value = "";
    while (_peekChar(s) && !_newlines[_peekChar(s)]) {
      value += _readChar(s);
    }
  }
  _skipNewlines(s);
  while (_peekChar(s)) {
    const pos = s.pos;
    let nextLevel = _countSpaces(s);
    s.pos = pos;
    if (nextLevel > level) {
      children = children || [];
      children.push(_readItem(s));
    } else {
      break;
    }
  }

  const result = {i, type, name};
  if (value) result.value = value;
  if (children) result.children = children;
  return result;
}

const _readUnityAsset = (data) => {
  const s = _stream(data);
  let items = [];
  while (_peekChar(s)) {
    const item = _readItem(s);
    if (item) {
      items.push(item);
    }
  }
  return items;
}

/* beatsaber song parser */

const _assert = (cond, message) => {
  if (!cond) {
    throw new Error("Assertion failed: " + message);
  }
}

const _inner = str => {
  return str.substr(1, str.length - 2);
}

const _readSongFromAsset = asset => {
  _assert(asset.length === 1, "expected one asset");
  _assert(asset[0].children, "expected children");
  asset = asset[0].children;
  const song = {};
  
  for (const item of asset) {
    if (item.name === 'm_Name') {
      song.name = _inner(item.value);
    } else if (item.name === '_jsonData') {
      const json = _inner(item.value);
      song.data = JSON.parse(json);
    }
  }
  return song;
}


const _readSong = data => {
  data = data.trim();
  if (data[0] === '{') {
    return JSON.parse(data);
  } else {
    const asset = _readUnityAsset(data);
    const song = _readSongFromAsset(asset);
    return song.data;
  }
}

const _readSongFromFile = name => {
  const data = fs.readFileSync(name, 'utf8');
  return _readSong(data);
}

const _readBeatsaverDirectory = name => {
  const song = JSON.parse(fs.readFileSync(path.join(name, 'info.json'), 'utf8'));
  for (const level of song.difficultyLevels) {
    if (level.jsonPath) {
      level.song = _readSongFromFile(path.join(name, level.jsonPath));
    }
  }
  return song;
}

module.exports = {
  readBeatsaverDirectory: _readBeatsaverDirectory,
  readSongFromFile: _readSongFromFile,
  readSong: _readSong,
  readUnityAsset: _readUnityAsset,
}

var isFile = function (path) {
  return fs.existsSync(path, "utf8") && fs.statSync(path).isFile();
};
var isDirectory = function (path) {
  return fs.existsSync(path, "utf8") && fs.statSync(path).isDirectory();
};

if (require.main === module) {
  const arg = process.argv[2];
  if (arg && isDirectory(arg) && isFile(path.join(arg, 'info.json'))) {
    const song = _readBeatsaverDirectory(arg);
    console.log(JSON.stringify(song, null, 2));
  }
  else if (arg && isFile(arg)) {
    console.log(JSON.stringify(_readSongFromFile(arg), null, 2));
  } else {
    console.log("\nProvide a path to a beatsaber song file / beatsaver song directory\n");
    console.log(`beat saber file structure : 

the beat saber beatmap format is a simple one line JSON file.

Map properties :

version : format version
beatsPerMinute : describe itself
beatsPerBar : unknown (does nothing for me, if you find what it does please tell me)
noteJumpSpeed : unknown
shuffle : unknown
shufflePeriod : unknown

Event :

time : Event time position in beats
type : Event type ()
value : Event value ()

Note :

time : Note time position in beats
lineIndex : Note horizontal position (0 to 3, start from left)
lineLayer : Note vertical position (0 to 2, start from bottom)
type : Note type (0 = red, 1 = blue, 3 = bomb)
cutDirection : Note cut direction (0 = up, 1 = down, 2 = left, 3 = right, 4 = up left, 5 = up right, 6 = down left, 7 = down right, 8 = no direction)

Obstacle :

time : Obstacle time position in beats
lineIndex : Obstacle horizontal position (0 to 3, start from left)
type : Obstacle type (0 = wall, 1 = ceiling)
duration : Obstacle length in beats
width : Obstacle width in lines (extend to the right)
`);
  }
}
