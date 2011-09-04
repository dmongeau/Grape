/*
 *
 * Requires
 *
 */
var fs = require('fs'),
	sys = require('sys');

/*
 *
 * Constants
 *
 */
var PATH_WEB = __dirname + '/..';

/*
 *
 * Web
 *
 */
var web = require('http').createServer(function(req, res) {
	
	function fileHandler(err, data) {
		if (err) {
			res.writeHead(500);
			return res.end('Error loading file');
		}
		
		res.writeHead(200);
		res.end(data);
	}
	
	if(req.url == '/') fs.readFile(PATH_WEB+'/index.html',fileHandler);
	else if(req.url.substr(-3) == '.js') fs.readFile(PATH_WEB + req.url,fileHandler);
});
web.listen(8080);


/*
 *
 * Socket.io
 *
 */
var io = require('socket.io').listen(web);
var Datastore = require('./Datastore').Datastore;
var datastore = new Datastore();
var methods = datastore.getSocketMethods();
var dataSocket = io.of('/data').on('connection', function (socket) {
	
	Datastore.addDisk(socket.id,socket);
	
	for(var key in methods) {
		socket.on(key,function(methodName) {
			return function() {
				console.log(methodName + ' : ' + sys.inspect(arguments));
				methods[methodName].apply(datastore,arguments);
			};
		}(key));
	}
	
	socket.on('init',function(data) {
		console.log('init');
		console.log(data);
		datastore.updateDiskBlocks(socket.id,data.blocks);
		socket.blocks = data.blocks;
		socket.freespace = data.space.free;
		socket.totalspace = data.space.total;
	});
	
});
