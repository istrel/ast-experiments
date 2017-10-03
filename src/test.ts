declare function require(name: string);
import * as esprima from 'esprima';
let fs = require('fs');
let glob = require('glob');
let path = require('path');

var basisFolderName = path.resolve('../../basisjs/src/basis');

console.log(basisFolderName);

// basis.data.value -> /Users/strelkov/work/basisjs/src/basis/data/value.js
function getAbsolutePath(basisRequire) {
    return basisFolderName + '/' + basisRequire.split('.').slice(1).join('/') + '.js';
}

glob(basisFolderName + '/**/*.js', function (err, relativePathnames: string[]) {
    relativePathnames.forEach(function (relativePath) {
        let absolutePath = path.resolve(relativePath);

        let fileContents: string = fs.readFileSync(absolutePath, 'utf8');

        let results = [];
        let ast = esprima.parseScript(fileContents, { range: true }, function (node, meta) {


            if (node.type === 'CallExpression' &&
                node.callee.type === 'Identifier' &&
                node.callee.name === 'require' &&
                node.arguments.length === 1
            ) {

                let stringNode = node.arguments[0];

                if (stringNode.type != 'Literal') {
                  return;
                }

                let requireString = stringNode.value;

                if (typeof requireString != 'string') {
                  return;
                }

                if (typeof requireString !== 'string') {
                    console.log('INCORRECT: ', requireString);
                }

                if (requireString[0] === '.') {
                    // console.log('RELATIVE: ', requireString);
                } else if (requireString.substr(0, 5) === 'basis') {
                    results.push(stringNode);
                    // console.log('BASIS: ', requireString);
                    // console.log(stringNode.range);
                } else {
                    console.log('WTF: ', requireString);
                }
            }
        });

        let descSortedResults = results.sort(function (a, b) {
            return b.range[0] - a.range[0];
        });

        if (descSortedResults.length) {
            console.log(absolutePath);
        }

        // console.log(descSortedResults);

        descSortedResults.forEach(function (node) {
            let dirname = path.dirname(absolutePath);
            let absolutePathToRequiredFile = getAbsolutePath(node.value);
            let relativePathToRequiredFile = path.relative(dirname, absolutePathToRequiredFile);

            if (relativePathToRequiredFile[0] !== '.') {
                relativePathToRequiredFile = './' + relativePathToRequiredFile;
            }

            console.log(relativePathToRequiredFile + ' -> ' + absolutePathToRequiredFile);

            let rangeStart = node.range[0];
            let rangeEnd = node.range[1];

            let before = fileContents.slice(0, rangeStart);
            let after = fileContents.slice(rangeEnd);
            fileContents = `${before}'${relativePathToRequiredFile}'${after}`
        });
        // console.log(absolutePath, descSortedResults);

        // let relativeToBasis = path.relative(basisFolderName, absolutePath);
        // console.log(relativeToBasis);

        fs.writeFileSync(absolutePath, fileContents, 'utf8');
    })
});
