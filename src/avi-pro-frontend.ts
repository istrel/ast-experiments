import * as esprima from 'esprima';
import * as ESTree from 'estree';
import * as fs from 'fs';
import * as path from 'path';
import * as csstree from 'css-tree';
import * as basis from 'basisjs';
import * as child_process from 'child_process';
import * as htmlparser from 'htmlparser2';

const tokenize = basis.require('basis.template.tokenize');

var basisFolderName = path.resolve('../../basisjs/src/basis');

const pathToRoot = path.resolve('../avi-pro-frontend');
const actiPath = path.resolve(pathToRoot, 'src/acti');

// basis.data.value -> /Users/strelkov/work/basisjs/src/basis/data/value.js
function getAbsolutePath(basisRequire) {
  return basisFolderName + '/' + basisRequire.split('.').slice(1).join('/') + '.js';
}

function isRequireOrResource(node) {
  return node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        (node.callee.name === 'require' || node.callee.name === 'resource' || node.callee.name === 'asset') &&
        node.arguments.length === 1;
}

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

function absolutePathFromRequire({ requireString, absolutePath, appPath } : { requireString : string, absolutePath : string, appPath : string }) {
  if (requireString[0] === '.') {
    // console.log('RELATIVE: ', requireString);
    const dirname = path.dirname(absolutePath);
    const absolutePathToRequiredFile = path.resolve(dirname, requireString);
    return addOptionalJsExtension(absolutePathToRequiredFile);
  } else if (requireString.substr(0, 6) === 'basis.' || requireString === 'socketMessenger' || requireString === ('aviProUI') || requireString === 'reactUI') {
    // console.log('BASIS. ', requireString);
    // skip libs
    return null;
  } else if (requireString.substr(0, 4) === 'app.') {
    // console.log('APP. ', requireString);
    const fromAppSegment = requireString.substr(4);
    const relative = toRelative(fromAppSegment);
    const absolutePath = path.resolve(appPath, relative);
    return absolutePath;
  } else if (requireString.substr(0, 4) === 'app:') {
    // console.log('APP: ', requireString);
    const fromAppSegment = requireString.substr(4);
    const absolutePath = path.resolve(appPath, fromAppSegment);
    return addOptionalJsExtension(absolutePath);
  } else if (requireString.substr(0, 5) === 'acti.') {
    // console.log('ACTI. ', requireString);
    const fromActiSegment = requireString.substr(5);
    const relative = toRelative(fromActiSegment);
    const absolutePath = path.resolve(actiPath, relative);
    return absolutePath;
  } else if (requireString.substr(0, 5) === 'acti:') {
    // console.log('ACTI: ', requireString);
    const fromActiSegment = requireString.substr(5);
    const absolutePath = path.resolve(actiPath, fromActiSegment);
    return addOptionalJsExtension(absolutePath);
  } else if (requireString[0] === '/') {
    const relativeFromRoot = requireString.substr(1);
    const absolutePath = path.resolve(pathToRoot, relativeFromRoot);
    return absolutePath;
  } else {
    throw new Error('WTF: ' + requireString);
  }
}

function isModuleExports(node : ESTree.Node) {
  return node.type === 'MemberExpression' &&
    (node.object.type === 'Identifier' && node.object.name === 'module') &&
    (node.property.type === 'Identifier' && node.property.name === 'exports');
}

function markExportedProp(absolutePath : string, propName : string, exportedPropertiesByFile : object) {
  exportedPropertiesByFile[absolutePath] = exportedPropertiesByFile[absolutePath] || {};
  exportedPropertiesByFile[absolutePath][propName] = true;
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

const nodeMetaKeys = ['loc', 'range', 'start', 'end', 'type', 'parent'];
function isNode(potentialNode) {
  return potentialNode && typeof potentialNode === 'object' && potentialNode.type;
}

function processPreset(
  {
    appRelativePath,
    startFile,
    visitedPropertiesByFile,
    exportedPropertiesByFile,
    numberOfAllRequires,
    numberOfRequiresWithProp,
    visitedAtAsterisk
  } : {
    appRelativePath: string,
    startFile: string,
    visitedPropertiesByFile : object,
    exportedPropertiesByFile : object,
    numberOfAllRequires : object,
    numberOfRequiresWithProp : object,
    visitedAtAsterisk : object
  }
) {
  const visited = {};
  const filesToVisit = [];
  const appPath = path.resolve(pathToRoot, appRelativePath);

  function markAsVisitedAtAll(filename : string) {
    numberOfAllRequires[filename] = numberOfAllRequires[filename] || 0;
    numberOfAllRequires[filename]++;
  }

  function markAsVisitedByProp(filename : string) {
    numberOfRequiresWithProp[filename] = numberOfRequiresWithProp[filename] || 0;
    numberOfRequiresWithProp[filename]++;
  }

  function processJsFile(absolutePath: string) {
    const fileContents: string = fs.readFileSync(absolutePath, 'utf8');

    const tree = esprima.parseScript(fileContents, { range: true })

    function walkNode(node, callback) {
      callback(node);

      for (const key in node) {
        if (nodeMetaKeys.indexOf(key) !== -1) {
          continue;
        }

        const potentialChildNode = node[key];

        if (Array.isArray(potentialChildNode)) {
          potentialChildNode.forEach(function(potentialDescendantNode) {
            if (isNode(potentialDescendantNode)) {
              walkNode({ ...potentialDescendantNode, parent: node }, callback);
            }
          });
        } else if (isNode(potentialChildNode)) {
          walkNode({ ...potentialChildNode, parent: node }, callback);
        }
      }
    }

    function parseNode(node) {
      // Search for properties for tree shaking.
      // For example search for require('./module/details/index.js').View;
      // Where './module/details/index.js' - is a target file, and 'View' - used property
      if (node.type === 'MemberExpression' && isRequireOrResource(node.object) && node.property.type === 'Identifier') {
        const callExpression : ESTree.CallExpression = node.object as any;
        const stringNode : ESTree.SimpleLiteral = callExpression.arguments[0] as any;
        const requireString = stringNode.value;

        if (typeof requireString != 'string') {
          return;
        }

        if (typeof requireString !== 'string') {
          console.log('INCORRECT: ', requireString);
        }

        const absPathToRequiredFile = absolutePathFromRequire({ requireString, appPath, absolutePath });
        if (absPathToRequiredFile !== null) {
          const propName = node.property.name;

          visitedPropertiesByFile[absPathToRequiredFile] = visitedPropertiesByFile[absPathToRequiredFile] || {};
          visitedPropertiesByFile[absPathToRequiredFile][propName] = true;

          markAsVisitedByProp(absPathToRequiredFile);
        }
      // search for exporting `module.exports = { foo: one, bar: somethingElse };`
      } else if (node.type === 'AssignmentExpression' && isModuleExports(node.left) && node.right.type === 'ObjectExpression') {
        const objExpression = node.right;
        objExpression.properties.forEach(function(propertyNode) {
          if (propertyNode.type !== 'Property') {
            throw new Error('OMG! I expected property but got: ' + JSON.stringify(propertyNode) + ' in ' + absolutePath);
          }

          if (propertyNode.key.type === 'Identifier') {
            markExportedProp(absolutePath, propertyNode.key.name, exportedPropertiesByFile);
          } else if (propertyNode.key.type === 'Literal' && typeof propertyNode.key.value === 'string') {
            markExportedProp(absolutePath, propertyNode.key.value, exportedPropertiesByFile);
          } else {
            throw new Error('OMG! I expected property with identifier or string literal key but got: ' + JSON.stringify(propertyNode)  + ' in ' + absolutePath);
          }
        })
      // search for simple require
      } else if (isRequireOrResource(node)) {
        const callExpression : ESTree.CallExpression = node as any;
        const stringNode = callExpression.arguments[0];

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

        const absPathToRequiredFile = absolutePathFromRequire({ requireString, appPath, absolutePath });
        if (absPathToRequiredFile !== null) {
          markAsVisitedAtAll(absPathToRequiredFile);
          filesToVisit.push(absPathToRequiredFile);

          // if this is require inside `var myNode = require('acti:ui/field.js').myNode;`
          if (node.parent && node.parent.type === 'VariableDeclarator') {
            visitedAtAsterisk[absPathToRequiredFile] = visitedAtAsterisk[absPathToRequiredFile] || [];
            visitedAtAsterisk[absPathToRequiredFile].push(absolutePath);
          }
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
    }

    walkNode(tree, parseNode);
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
            } else if (requireString.substr(0, 6) === 'basis.' || requireString.substr(0, 7) === ('aviPro.')) {
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
      if (pathFragments[0] in object === false) {
        return null;
      }

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

          if (!markup) {
              console.log('No markup: ', );
              console.log(absolutePath);
              console.log(pathFragments);
              break;
          }
          processTmplContents(absolutePath, markup, appRelativePath);
          break;
        case 'plural-markup':
          const markupArray = getAt(dict, pathFragments);

          if (!markupArray) {
            console.log('No markup array: ', );
            console.log(absolutePath);
            console.log(pathFragments);
            break;
          }

          markupArray.forEach(function(markup) {
            processTmplContents(absolutePath, markup, appRelativePath);
          });
          break;
        case 'enum-markup':
          const markupObject = getAt(dict, pathFragments);


          if (!markupObject) {
              console.log('No markup object: ', );
              console.log(absolutePath);
              console.log(pathFragments);
              break;
          }

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

  const absolutePathToStartFile = path.resolve('../avi-pro-frontend/', startFile);

  getRequiredFiles(absolutePathToStartFile);

  return visited;
}

const visited = {};
const visitedPropertiesByFile = {};
const exportedPropertiesByFile = {};
const numberOfAllRequires = {};
const numberOfRequiresWithProp = {};
const visitedAtAsterisk = {};

// start parsing from js
[
  ['src/avipro/app', 'src/avipro/app/index.js'],
  ['src/avipro/app', 'src/avipro/remote/index.js']
].forEach(function([appRelativePath, startFile]) {
  const presetVisited = processPreset({
    appRelativePath,
    startFile,
    visitedPropertiesByFile,
    exportedPropertiesByFile,
    numberOfAllRequires,
    numberOfRequiresWithProp,
    visitedAtAsterisk
  });

  for (var key in presetVisited) {
    visited[key] = true;
  }
}, {});

// parse html files
[
  'src/avipro/index.html',
  'src/avipro/remote.html'
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
        case '.ttf':
        case '.eot':
        case '.eot?#iefix':
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
  'src/avipro/static/AvitoProBetaTerms.pdf'
]
  .forEach(function(relpath) {
    const absolutePath = path.resolve(pathToRoot, relpath);

    visited[absolutePath] = true;
  });

const existing = {};

const srcPath = path.resolve('../avi-pro-frontend/src');
child_process.execSync('git ls-files', { cwd: srcPath })
  .toString()
  .split('\n')
  .map(relative => path.resolve(srcPath, relative))
  .forEach(function(path) {
    if (path.match('src/react')) {
      return;
    }

    if (!visited[path] && fs.existsSync(path) && fs.statSync(path).isFile()) {
      console.log(path);
      fs.unlinkSync(path);
    }
  });

for (const filename in visitedPropertiesByFile) {
  if (filename in exportedPropertiesByFile === false) {
    // delete visitedPropertiesByFile;
  } else {
    const visitedProperties = visitedPropertiesByFile[filename];
    const exportedProperties = exportedPropertiesByFile[filename];

    const notUsedExports = [];

    for (var propName in exportedProperties) {
      if (propName in visitedProperties === false) {
        notUsedExports.push(propName);
      }
    }

    for (var propName in visitedProperties) {
      if (propName in exportedProperties === false) {
        console.log(`Exported property ${propName} not found in ${filename}`);
      }
    }

    if (notUsedExports.length) {
      console.log(`Exported names ${notUsedExports.map(name => `"${name}"`).join(', ')} in file "${filename}" exported, but not used`)
    }

    if (visitedAtAsterisk[filename]) {
      console.log(`Unexpected global require of ${filename} in files: ${visitedAtAsterisk[filename].join(' , ')}`)
    }
  }
}