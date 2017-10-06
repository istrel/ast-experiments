declare function require(name: string);
import * as esprima from 'esprima';
import * as fs from 'fs';
import * as path from 'path';
import * as basis from 'basisjs';

const tokenize = basis.require('basis.template.tokenize');

var basisFolderName = path.resolve('../../basisjs/src/basis');

console.log(basisFolderName);

// basis.data.value -> /Users/strelkov/work/basisjs/src/basis/data/value.js
function getAbsolutePath(basisRequire) {
  return basisFolderName + '/' + basisRequire.split('.').slice(1).join('/') + '.js';
}

// relative
// basis
// app:
// app.
// acti:
// acti.

const pathToRoot = path.resolve('../web-frontend');
const visited = {};
const filesToVisit = [];
let appPath = path.resolve(pathToRoot, 'src/dealer/app');
const actiPath = path.resolve(pathToRoot, 'src/acti');
// set acti = path to acti
// set app = path to dealer/app
// set root file = index.html
// increase counters

// set app = path to agent/app
// set root file = index.html
// increase counters

function toRelative(dottedPath) {
  return dottedPath.replace(/\./g, '/') + '.js';
}

function addOptionalJsExtension(absolutePath: string) {
  if (path.extname(absolutePath) === '') {
    return absolutePath + '.js';
  } else {
    return absolutePath;
  }
}

function processJsFile(absolutePath: string) {
  const fileContents: string = fs.readFileSync(absolutePath, 'utf8');

  esprima.parseScript(fileContents, { range: true }, function (node, meta) {
    if (node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      (node.callee.name === 'require' || node.callee.name === 'resource') &&
      node.arguments.length === 1
    ) {
      const stringNode = node.arguments[0];

      if (stringNode.type != 'Literal') {
        return;
      }

      const requireString = stringNode.value;

      if (typeof requireString != 'string') {
        return;
      }

      if (typeof requireString !== 'string') {
        console.log('INCORRECT: ', requireString);
      }

      if (requireString[0] === '.') {
        console.log('RELATIVE: ', requireString);
        const dirname = path.dirname(absolutePath);
        const absolutePathToRequiredFile = path.resolve(dirname, requireString);
        filesToVisit.push(addOptionalJsExtension(absolutePathToRequiredFile));
      } else if (requireString.substr(0, 6) === 'basis.') {
        console.log('BASIS. ', requireString);
        // skip basis
      } else if (requireString.substr(0, 4) === 'app.') {
        console.log('APP. ', requireString);
        const fromAppSegment = requireString.substr(4);
        const relative = toRelative(fromAppSegment);
        const absolutePath = path.resolve(appPath, relative);
        filesToVisit.push(absolutePath);
      } else if (requireString.substr(0, 4) === 'app:') {
        console.log('APP: ', requireString);
        const fromAppSegment = requireString.substr(4);
        const absolutePath = path.resolve(appPath, fromAppSegment);
        filesToVisit.push(addOptionalJsExtension(absolutePath));
      } else if (requireString.substr(0, 5) === 'acti.') {
        console.log('ACTI. ', requireString);
        const fromActiSegment = requireString.substr(5);
        const relative = toRelative(fromActiSegment);
        const absolutePath = path.resolve(actiPath, relative);
        filesToVisit.push(absolutePath);
      } else if (requireString.substr(0, 5) === 'acti:') {
        console.log('ACTI: ', requireString);
        const fromActiSegment = requireString.substr(5);
        const absolutePath = path.resolve(actiPath, fromActiSegment);
        filesToVisit.push(addOptionalJsExtension(absolutePath));
      } else {
        console.log('WTF: ', requireString);
      }
    }
  });
}

function processTmplFile(absolutePath: string) {
  const fileContents: string = fs.readFileSync(absolutePath, 'utf8');
  const tokens = tokenize(fileContents);
  const tokensToParse = tokens.slice(0);

  while (tokensToParse.length > 0) {
    const nextToken = tokensToParse.pop();

    if (
      nextToken.prefix === 'b' &&
      nextToken.name === 'l10n' ||
      nextToken.name === 'style' ||
      nextToken.name === 'include' ||
      nextToken.name === 'svg'
    ) {
      nextToken.attrs.forEach(function(attr) {
        if (attr.name === 'src') {
          const requireString = attr.value;

          // parsing tmpl files differs a bit, so I copy/pasted it
          if (requireString[0] === '.') {
            console.log('RELATIVE: ', requireString);
            const dirname = path.dirname(absolutePath);
            const absolutePathToRequiredFile = path.resolve(dirname, requireString);
            filesToVisit.push(absolutePathToRequiredFile);
          } else if (requireString.substr(0, 6) === 'basis.') {
            console.log('BASIS. ', requireString);
            // skip basis
          } else if (requireString.substr(0, 4) === 'app.') {
            console.log('APP. ', requireString);
            // skip dotted paths because they are visited in js files
          } else if (requireString.substr(0, 4) === 'app:') {
            console.log('APP: ', requireString);
            const fromAppSegment = requireString.substr(4);
            const absolutePath = path.resolve(appPath, fromAppSegment);
            filesToVisit.push(absolutePath);
          } else if (requireString.substr(0, 5) === 'acti.') {
            console.log('ACTI. ', requireString);
            // skip dotted paths because they are visited in js files
          } else if (requireString.substr(0, 5) === 'acti:') {
            console.log('ACTI: ', requireString);
            const fromActiSegment = requireString.substr(5);
            const absolutePath = path.resolve(actiPath, fromActiSegment);
            filesToVisit.push(absolutePath);
          } else {
            console.log('WTF: ', requireString);
          }
        }
      });
    } else if (nextToken.name === 'img') {
      nextToken.attrs.forEach(function(attr) {
        if (attr.name === 'src' && attr.value[0] != '{') {
          const dirname = path.dirname(absolutePath);
          const absolutePathToRequiredFile = path.resolve(dirname, attr.value);
          filesToVisit.push(absolutePathToRequiredFile);
        }
      })
    }

    tokensToParse.push(...nextToken.children);
  }
}

function processL10nFile(absolutePath: string) {
  console.log('TODO: Processing .l10n files not implemented - skipping')
}

function processCssFile(absolutePath: string) {
  console.log('TODO: Processing .css files not implemented - skipping')
}

// parse css for images?

function getRequiredFiles(absolutePath: string) {
  filesToVisit.push(absolutePath);

  while (filesToVisit.length > 0) {
    const nextFile = filesToVisit.pop();

    if (!visited[nextFile]) {
      visited[nextFile] = true;

      switch (path.extname(nextFile)) {
        case '.js':
          processJsFile(nextFile);
          break;
        case '.l10n':
          processL10nFile(nextFile);
          break;
        case '.tmpl':
          processTmplFile(nextFile);
          break;
        case '.css':
          processCssFile(nextFile);
          break;
        case '.png':
        case '.svg':
        case '.json':
          // nothing to do with json,svg and css. Just mark it as visited
          break;
        default:
          throw new Error(`${nextFile} has not valid extension`)
      }
    }
  }
}

getRequiredFiles('../web-frontend/src/dealer/app/index.js');

console.log(Object.keys(visited));
