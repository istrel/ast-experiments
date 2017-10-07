declare function require(name: string);
import * as esprima from 'esprima';
import * as fs from 'fs';
import * as path from 'path';
import * as basis from 'basisjs';
import * as csstree from 'css-tree';

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
    } else {
      // check for require('basis.l10n').dictionary(...)
      if (node.type !== 'CallExpression') {
        return;
      }

      if (node.callee.type !== 'MemberExpression') {
        return;
      }

      if (node.callee.object.type !== 'CallExpression') {
        return;
      }

      const potentialRequire = node.callee.object;

      if (!potentialRequire) {
        return;
      }

      if (
        !(
          potentialRequire.callee.type == 'Identifier' &&
          potentialRequire.callee.name === 'require' &&
          potentialRequire.arguments.length === 1
        )
      ) {
        return;
      }

      const potentialRequireArg = potentialRequire.arguments[0];

      if (potentialRequireArg.type !== 'Literal') {
        return;
      }

      if (potentialRequireArg.value !== 'basis.l10n') {
        return;
      }

      if (node.callee.property.type !== 'Identifier') {
        return;
      }

      if (node.callee.property.name !== 'dictionary') {
        return;
      }

      if (node.arguments.length !== 1) {
        return;
      }

      const singleArg = node.arguments[0];
      const argCode = fileContents.substring(singleArg.range[0], singleArg.range[1]);
      const dirname = path.dirname(absolutePath);

      const evaledPath = new Function('__dirname', '__filename', `return ${argCode};`)(dirname, absolutePath);

      // basis:ui paths are exceptions
      if (evaledPath.substr(0, 6) === 'basis:') {
        return;
      }

      const resolvedPath = path.resolve(evaledPath);

      filesToVisit.push(resolvedPath);
    }
  });
}

function processTmplContents(absolutePath: string, fileContents: string) {
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
            throw new Error('WTF: ' + requireString);
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

function processTmplFile(absolutePath: string) {
  const fileContents: string = fs.readFileSync(absolutePath, 'utf8');

  processTmplContents(absolutePath, fileContents);
}

function getAt(object, pathFragments) {
  if (pathFragments.length === 0) {
    return object;
  } else {
    return getAt(object[pathFragments[0]], pathFragments.slice(1));
  }
}

function processL10nFile(absolutePath: string) {
  const fileContents = fs.readFileSync(absolutePath, 'utf8');
  const json = JSON.parse(fileContents);

  if (!json._meta || !json._meta.type) {
    return;
  }

  const typedefs = json._meta.type;
  const dict = json['ru-RU'];

  for (const key in typedefs) {
    const dictType = typedefs[key];
    const pathFragments = key.split('.');

    switch (dictType) {
      case 'markup':
        const markup = getAt(dict, pathFragments);
        processTmplContents(absolutePath, markup);
        break;
      case 'plural-markup':
        const markupArray = getAt(dict, pathFragments);
        markupArray.forEach(function(markup) {
          processTmplContents(absolutePath, markup);
        });
        break;
      case 'enum-markup':
        const markupObject = getAt(dict, pathFragments);
        for (const key of markupObject) {
          const markup = markupObject[key];
          processTmplContents(absolutePath, markup);
        }
        break;
    }
  }
}

function processCssFile(absolutePath: string) {
  const fileContents: string = fs.readFileSync(absolutePath, 'utf8');
  const ast = csstree.parse(fileContents);

  csstree.walk(ast, function(node) {
    if (node.type === 'Url') {
      const dirname = path.dirname(absolutePath);
      let relativePath;

      if (node.value.type === 'Raw') {
        relativePath = node.value.value;
      } else if (node.value.type === 'String') {
        // dirty way to unescape
        relativePath = eval(node.value.value);
      } else {
        throw new Error(`unexpected type of node.value - ${node.value.type}`)
      }

      const absolutePathToRequiredFile = path.resolve(dirname, relativePath);

      filesToVisit.push(absolutePathToRequiredFile);
    }
  });
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
        case '.gif':
        case '.woff':
        case '.jpg':
        case '.svg':
        case '.json':
          // nothing to do with json and images. Just mark it as visited
          break;
        default:
          throw new Error(`${nextFile} has not valid extension`)
      }
    }
  }
}

getRequiredFiles('../web-frontend/src/dealer/app/index.js');

console.log(Object.keys(visited));
