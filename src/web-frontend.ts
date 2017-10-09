import * as esprima from 'esprima';
import * as fs from 'fs';
import * as path from 'path';
import * as csstree from 'css-tree';
import * as basis from 'basisjs';
import * as child_process from 'child_process';
import * as htmlparser from 'htmlparser2';

const tokenize = basis.require('basis.template.tokenize');

var basisFolderName = path.resolve('../../basisjs/src/basis');

const pathToRoot = path.resolve('../web-frontend');
const actiPath = path.resolve(pathToRoot, 'src/acti');

// basis.data.value -> /Users/strelkov/work/basisjs/src/basis/data/value.js
function getAbsolutePath(basisRequire) {
  return basisFolderName + '/' + basisRequire.split('.').slice(1).join('/') + '.js';
}

function processCssFile(absolutePath: string, filesToVisit) {
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

function processPreset(appRelativePath: string, startFile: string) {
  const visited = {};
  const filesToVisit = [];
  const appPath = path.resolve(pathToRoot, appRelativePath);

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
        (node.callee.name === 'require' || node.callee.name === 'resource' || node.callee.name === 'asset') &&
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
          // console.log('RELATIVE: ', requireString);
          const dirname = path.dirname(absolutePath);
          const absolutePathToRequiredFile = path.resolve(dirname, requireString);
          filesToVisit.push(addOptionalJsExtension(absolutePathToRequiredFile));
        } else if (requireString.substr(0, 6) === 'basis.' || requireString === 'socketMessenger') {
          // console.log('BASIS. ', requireString);
          // skip libs
        } else if (requireString.substr(0, 4) === 'app.') {
          // console.log('APP. ', requireString);
          const fromAppSegment = requireString.substr(4);
          const relative = toRelative(fromAppSegment);
          const absolutePath = path.resolve(appPath, relative);
          filesToVisit.push(absolutePath);
        } else if (requireString.substr(0, 4) === 'app:') {
          // console.log('APP: ', requireString);
          const fromAppSegment = requireString.substr(4);
          const absolutePath = path.resolve(appPath, fromAppSegment);
          filesToVisit.push(addOptionalJsExtension(absolutePath));
        } else if (requireString.substr(0, 5) === 'acti.') {
          // console.log('ACTI. ', requireString);
          const fromActiSegment = requireString.substr(5);
          const relative = toRelative(fromActiSegment);
          const absolutePath = path.resolve(actiPath, relative);
          filesToVisit.push(absolutePath);
        } else if (requireString.substr(0, 5) === 'acti:') {
          // console.log('ACTI: ', requireString);
          const fromActiSegment = requireString.substr(5);
          const absolutePath = path.resolve(actiPath, fromActiSegment);
          filesToVisit.push(addOptionalJsExtension(absolutePath));
        } else if (requireString[0] === '/') {
          const relativeFromRoot = requireString.substr(1);
          const absolutePath = path.resolve(pathToRoot, relativeFromRoot);
          filesToVisit.push(absolutePath);
        } else {
          throw new Error('WTF: ' + requireString);
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

        const evaledPath = new Function('__dirname', '__filename', `return ${argCode};`)(dirname, absolutePath.replace(/\.js$/, '.l10n'));

        // basis:ui paths are exceptions
        if (evaledPath.substr(0, 6) === 'basis:') {
          return;
        }

        const resolvedPath = path.resolve(evaledPath);

        filesToVisit.push(resolvedPath);
      }
    });
  }

  function processTmplContents(absolutePath: string, fileContents: string, appRelativePath: string) {
    const tokens = tokenize(fileContents);
    const tokensToParse = tokens.slice(0);

    let l10nPath = '';

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

            if (nextToken.name === 'l10n') {
              l10nPath = requireString;
            }

            // parsing tmpl files differs a bit, so I copy/pasted it
            if (requireString[0] === '.') {
              // console.log('RELATIVE: ', requireString);
              const dirname = path.dirname(absolutePath);
              const absolutePathToRequiredFile = path.resolve(dirname, requireString);
              filesToVisit.push(absolutePathToRequiredFile);
            } else if (requireString.substr(0, 6) === 'basis.') {
              // console.log('BASIS. ', requireString);
              // skip basis
            } else if (requireString.substr(0, 4) === 'app.') {
              // console.log('APP. ', requireString);
              // skip dotted paths because they are visited in js files
            } else if (requireString.substr(0, 4) === 'app:') {
              // console.log('APP: ', requireString);
              const fromAppSegment = requireString.substr(4);
              const absolutePath = path.resolve(appPath, fromAppSegment);
              filesToVisit.push(absolutePath);
            } else if (requireString.substr(0, 5) === 'acti.') {
              // console.log('ACTI. ', requireString);
              // skip dotted paths because they are visited in js files
            } else if (requireString.substr(0, 5) === 'acti:') {
              // console.log('ACTI: ', requireString);
              const fromActiSegment = requireString.substr(5);
              const absolutePath = path.resolve(actiPath, fromActiSegment);
              filesToVisit.push(absolutePath);
            } else {
              throw new Error('WTF: ' + requireString);
            }
          }
        });
      } else if (nextToken.name === 'img') {
        const absolutePathToAppDir = path.resolve(pathToRoot, appRelativePath);
        const dirname = path.dirname(absolutePathToAppDir);

        nextToken.attrs.forEach(function(attr) {
          if (attr.name === 'src' && attr.value[0] != '{') {
            const absolutePathToRequiredFile = path.resolve(dirname, attr.value);
            filesToVisit.push(absolutePathToRequiredFile);
          }

          if (attr.name === 'srcset' && attr.value[0] != '{') {
            const srcsetAttr =
              attr.value
                .replace(/\n/g, ' ')
                .replace(/\s+/g, ' ')
                .replace(/^\s+/g, '')
                .replace(/\s+$/g, '');
            const images = srcsetAttr.split(/\s*,\s*/).map(srcsetStr => srcsetStr.split(' ')[0]);

            images.forEach(function(image) {
              if (image[0] == '{') {
                return;
              }

              const absolutePathToRequiredFile = path.resolve(dirname, image);
              filesToVisit.push(absolutePathToRequiredFile);
            });
          }
        })
      }

      tokensToParse.push(...nextToken.children);
    }

    if (!l10nPath && fileContents.match(/\bl10n:\b/)) {
      const l10nPath = absolutePath.replace(/\.tmpl$/, '.l10n');
      filesToVisit.push(l10nPath);
    }
  }

  function processTmplFile(absolutePath: string, appRelativePath: string) {
    const fileContents: string = fs.readFileSync(absolutePath, 'utf8');

    if (fileContents == null) {
      throw new Error(`${absolutePath} does not exist`);
    }

    processTmplContents(absolutePath, fileContents, appRelativePath);
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
          processTmplContents(absolutePath, markup, appRelativePath);
          break;
        case 'plural-markup':
          const markupArray = getAt(dict, pathFragments);
          markupArray.forEach(function(markup) {
            processTmplContents(absolutePath, markup, appRelativePath);
          });
          break;
        case 'enum-markup':
          const markupObject = getAt(dict, pathFragments);
          for (const key in markupObject) {
            const markup = markupObject[key];
            processTmplContents(absolutePath, markup, appRelativePath);
          }
          break;
      }
    }
  }

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
            processTmplFile(nextFile, appRelativePath);
            break;
          case '.css':
            processCssFile(nextFile, filesToVisit);
            break;
          case '.png':
          case '.gif':
          case '.woff':
          case '.jpg':
          case '.ico':
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

  const absolutePathToStartFile = path.resolve('../web-frontend/', startFile);

  getRequiredFiles(absolutePathToStartFile);

  return visited;
}

const visited = {};

// start parsing from js
[
  ['src/agent/app', 'src/agent/app/index.js'],
  ['src/agent/app', 'src/agent/remote/index.js'],
  ['src/agent/app', 'src/agent/landing/index.js'],
  ['src/agent/app', 'src/agent/terms/index.js'],
  ['src/agent/app', 'src/agent/terms/call-tracking.js'],
  ['src/dealer/app', 'src/dealer/app/index.js'],
  ['src/dealer/app', 'src/dealer/remote/index.js'],
  ['src/dealer/app', 'src/dealer/landing/index.js'],
  ['src/dealer/app', 'src/dealer/terms/index.js'],
  ['src/dealer/app', 'src/dealer/terms/call-tracking.js']
].forEach(function([appRelativePath, startFile]) {
  const presetVisited = processPreset(appRelativePath, startFile);

  for (var key in presetVisited) {
    visited[key] = true;
  }
}, {});

// parse html files
[
  'src/agent/index.html',
  'src/agent/landing.html',
  'src/agent/maintenance.html',
  'src/agent/remote.html',
  'src/agent/terms-ct.html',
  'src/agent/terms.html',
  'src/dealer/index.html',
  'src/dealer/landing.html',
  'src/dealer/remote.html',
  'src/dealer/terms-ct.html',
  'src/dealer/terms.html'
].forEach(function(relativePathToHtml) {
  const absolutePath = path.resolve(pathToRoot, relativePathToHtml);

  visited[absolutePath] = true;

  const fileContents = fs.readFileSync(absolutePath, 'utf8');

  const filesToVisit = [];

  const parser = new htmlparser.Parser({
    onopentag: function(tagname, attrs) {
      let relpath = '';

      if (tagname === 'img') {
        relpath = attrs.src;
      } else if (tagname === 'link') {
        relpath = attrs.href;
      } else if (tagname === 'meta' && attrs.name && attrs.name.match(/^msapplication-.*(logo|TileImage)$/)) {
        relpath = attrs.content;
      }

      if (!relpath) {
        return;
      }

      if (relpath.substr(0, 4) === 'http') {
        return;
      }

      const dirname = path.dirname(absolutePath);
      const absolutePathToFile = path.resolve(dirname, relpath);

      filesToVisit.push(absolutePathToFile);
    }
  });

  parser.write(fileContents);
  parser.end();

  while (filesToVisit.length > 0) {
    const nextFile = filesToVisit.pop();

    if (!visited[nextFile]) {
      visited[nextFile] = true;

      switch (path.extname(nextFile)) {
        case '.css':
          processCssFile(nextFile, filesToVisit);
          break;
        case '.png':
        case '.gif':
        case '.woff':
        case '.jpg':
        case '.ico':
        case '.svg':
        case '.json':
          // nothing to do with json and images. Just mark it as visited
          break;
        default:
          throw new Error(`${nextFile} has not valid extension`)
      }
    }
  }
});

// whitelist some files
[
  'src/acti/old-browser/detect.js',
  'src/agent/maintenance/img/bg.png',
  'src/agent/maintenance/img/cover.jpg',
  'src/agent/maintenance/img/logo.png'
]
  .forEach(function(relpath) {
    const absolutePath = path.resolve(pathToRoot, relpath);

    visited[absolutePath] = true;
  });

const existing = {};

const srcPath = path.resolve('../web-frontend/src');
child_process.execSync('git ls-files', { cwd: srcPath })
  .toString()
  .split('\n')
  .map(relative => path.resolve(srcPath, relative))
  .forEach(function(path) {
    if (!visited[path] && fs.existsSync(path) && fs.statSync(path).isFile()) {
      console.log(path);
    }
  });
