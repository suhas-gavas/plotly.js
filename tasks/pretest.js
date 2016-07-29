var fs = require('fs');

var constants = require('./util/constants');
var common = require('./util/common');
var containerCommands = require('./util/container_commands');
var isCI = process.env.CIRCLECI;

// main
makeCredentialsFile();
makeSetPlotConfigFile();
makeTestImageFolders();
if(isCI) setupImageTestContainer();

// Create a credentials json file,
// to be required in jasmine test suites and test dashboard
function makeCredentialsFile() {
    var credentials = JSON.stringify({
        MAPBOX_ACCESS_TOKEN: constants.mapboxAccessToken
    }, null, 2);

    common.writeFile(constants.pathToCredentials, credentials);
}

// Create a 'set plot config' file,
// to be included in the image test index
function makeSetPlotConfigFile() {
    var setPlotConfig = [
        '\'use strict\';',
        '',
        '/* global Plotly:false */',
        '',
        'Plotly.setPlotConfig({',
        '    mapboxAccessToken: \'' + constants.mapboxAccessToken + '\'',
        '});',
        ''
    ].join('\n');

    common.writeFile(constants.pathToSetPlotConfig, setPlotConfig);
}

// Make artifact folders for image tests
function makeTestImageFolders() {
    if(!common.doesDirExist(constants.pathToTestImagesDiff)) {
        fs.mkdirSync(constants.pathToTestImagesDiff);
    }

    if(!common.doesDirExist(constants.pathToTestImages)) {
        fs.mkdirSync(constants.pathToTestImages);
    }
}

// On CircleCI, run and setup image test container once an for all
function setupImageTestContainer() {
    var cmd = containerCommands.getRunCmd(, isCI, [
        containerCommands.dockerRun,
        containerCommands.setup
    ]);

    common.execCmd(cmd);
}
