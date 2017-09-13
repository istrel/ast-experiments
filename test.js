var esprima = require('esprima');
var fs = require('fs');
var glob = require('glob');
var path = require('path');

var basisFolderName = path.resolve('../basisjs/src/basis');

// basis.data.value -> /Users/strelkov/work/basisjs/src/basis/data/value.js
function getAbsolutePath(basisRequire) {
    return basisFolderName + '/' + basisRequire.split('.').slice(1).join('/') + '.js';
}

glob('../basisjs/src/basis/**/*.js', function(err, relativePathnames) {
    relativePathnames.forEach(function(relativePath) {
        var absolutePath = path.resolve(relativePath);

        var fileContents = fs.readFileSync(absolutePath, 'utf8');

        var results = [];
        var ast = esprima.parseScript(fileContents, { range: true }, function(node, meta) {
            if (node.type === 'CallExpression' &&
                node.callee.type === 'Identifier' &&
                node.callee.name === 'require' &&
                node.arguments.length === 1) {
                    var stringNode = node.arguments[0];
                    var requireString = node.arguments[0].value;

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

        var descSortedResults = results.sort(function(a, b) {
            return b.range[0] - a.range[0];
        });

        if (descSortedResults.length) {
            console.log(absolutePath);
        }

        // console.log(descSortedResults);

        descSortedResults.forEach(function(node) {
            var dirname = path.dirname(absolutePath);
            var absolutePathToRequiredFile = getAbsolutePath(node.value);
            var relativePathToRequiredFile = path.relative(dirname, absolutePathToRequiredFile);

            if (relativePathToRequiredFile[0] !== '.') {
                relativePathToRequiredFile = './' + relativePathToRequiredFile;
            }

            console.log(relativePathToRequiredFile +  ' -> ' + absolutePathToRequiredFile);

            var rangeStart = node.range[0];
            var rangeEnd = node.range[1];

            var before = fileContents.slice(0, rangeStart);
            var after = fileContents.slice(rangeEnd);
            fileContents = `${before}'${relativePathToRequiredFile}'${after}`
        });
        // console.log(absolutePath, descSortedResults);

        // var relativeToBasis = path.relative(basisFolderName, absolutePath);
        // console.log(relativeToBasis);

        fs.writeFileSync(absolutePath, fileContents, 'utf8');
    })
});