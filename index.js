/*eslint-env node*/

var connect = require('connect');
var serveStatic = require('serve-static');
var path = require('path');

var port = 9000;
var folder = path.resolve(__dirname, 'web');

connect().use(serveStatic(folder)).listen(port, function(){
    console.log('Server running on %d...', port);
});