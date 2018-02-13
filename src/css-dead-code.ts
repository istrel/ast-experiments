import * as esprima from 'esprima';
import * as ESTree from 'estree';
import * as fs from 'fs';
import * as path from 'path';
import * as csstree from 'css-tree';
import * as child_process from 'child_process';
import * as htmlparser from 'htmlparser2';
import * as babelEslint from 'babel-eslint';
import { debug } from 'util';

const cssFilePath = process.argv[2];
const cssFileSource = fs.readFileSync(cssFilePath, 'utf-8');

const jsFilePath = process.argv[3];
const jsFileSource = fs.readFileSync(jsFilePath, 'utf-8');

const foundClassNames = {};

const cssAst = csstree.parse(cssFileSource);
csstree.walk(cssAst, function (node) {
  if (node.type === 'ClassSelector') {
    foundClassNames[node.name] = true;
  }
});

const jsAst = babelEslint.parseForESLint(jsFileSource);

const metaKeys = ['start', 'end', 'loc', 'type', 'tokens', 'parent'];
function walk(node, callback) {
  if (typeof node.type !== 'string') {
    return;
  }

  callback(node);

  for (const prop in node) {
    if (metaKeys.indexOf(prop) !== -1) {
      continue;
    }

    const value = node[prop];

    if (typeof value !== 'object') {
      continue;
    }

    if (!value) {
      continue;
    }

    if (Array.isArray(value)) {
      value.forEach(childNode => {
        if (typeof childNode === 'object') {
          walk({...childNode, parent: node}, callback);
        }
      });
    } else {
      walk({...value, parent: node}, callback);
    }
  }
}

const foundCssImports = {};
walk(jsAst.ast, node => {
  if (node.type === 'ImportDeclaration') {
    const { source } = node;
    if (source.type !== 'Literal' && typeof source.value !== 'string') {
      console.log('something unexpected');

      throw source;
    }

    if (source.value[0] !== '.') {
      return;
    }

    const dirname = path.dirname(jsFilePath);
    const absolutePath = path.resolve(dirname, source.value);

    if (absolutePath.match(/\.css$/g)) {
      if (node.specifiers.length !== 1) {
        throw node;
      }

      const firstSpecifier = node.specifiers[0];

      foundCssImports[absolutePath] = firstSpecifier.local.name;
    }
  }
});

const cssImportName = foundCssImports[cssFilePath];
const usedClasses = {};

walk(jsAst.ast, node => {
  if (node.type === 'Identifier' && node.name === cssImportName) {
    const parent = node.parent;

    if (parent.type === 'ImportDefaultSpecifier') {
      return;
    }

    if (parent.type !== 'MemberExpression') {
      throw new Error('Not member');
    }

    const property = parent.property;

    // styles['hello']
    if (parent.computed) {
      if (property.type !== 'Literal') {
        throw new Error('Not literal');
      }

      usedClasses[property.value] = true;
    } else {
      if (property.type !== 'Identifier') {
        throw new Error('Unexpected identifier');
      }

      usedClasses[property.name] = true;
    }
  }
});

console.log(usedClasses);
console.log(foundClassNames);