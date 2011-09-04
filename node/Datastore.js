
/*
 *
 * Datastore
 *
 */
var Datastore = function() {
	
	this.totalSpace = 0;
	this.freeSpace = 0;
	this._blocks = {};
	this._cache = {};
	
};

/*
 *
 * Constants
 *
 */
Datastore.MAX_BLOCK_SIZE = 20000;
Datastore.CACHE_EXPIRE = (1*24*3600);
Datastore.SOCKET_METHODS = ['get','set','remove'];

/*
 *
 * Public methods
 *
 */
Datastore.prototype = {
	
	/*
	 *
	 * Set an item in the datastore
	 *
	 */
	set : function(key,data,opts) {
		
		key = key.substr(0,1) == '/' ? key.substr(1):key;
		
		if(!opts) opts = {};
		if(typeof(data) != 'string') data = JSON.stringify(data);
		
		var blocks = {};
		
		var name = key.substr(key.lastIndexOf('/')+1);
		var path = key.substr(0,key.lastIndexOf('/')+1);
		
		var totalSize = 0;
		var obj = {
			'key' : key,
			'name' : name,
			'path' : path,
			'length' : data.length,
			'metadata' : (!opts.metadata) ? null:opts.metadata,
			'creationDate' : (new Date()).getTime(),
			'modificationDate' : (new Date()).getTime()
		};
		if(data.length > Datastore.MAX_BLOCK_SIZE) {
			obj.blocks = [];
			var objChecksum = Datastore.checksum(JSON.stringify(obj))
			var blocksCount = Math.ceil(data.length/Datastore.MAX_BLOCK_SIZE);
			for(var i = 0; i < blocksCount; i++) {
				var str = data.substr(i*Datastore.MAX_BLOCK_SIZE,Datastore.MAX_BLOCK_SIZE);
				var blockKey = objChecksum + '_' + Datastore.checksum(str);
				blocks[blockKey] = str;
				totalSize += str.length;
				obj.blocks.push(blockKey);
			}
		} else {
			obj.data = data;
		}
		blocks[key] = JSON.stringify(obj);
		totalSize += blocks[key].length;
		
		this._saveItem(blocks,totalSize);
	},
	/*
	 *
	 * Get the value of an item in the datastore
	 *
	 */
	get : function(key,callback,opts) {
		
		key = key.substr(0,1) == '/' ? key.substr(1):key;
		
		if(!this._blocks[key]) callback(null);
		
		if(this._cache[key]) {
			console.log('cache : '+key);
			var itemBlock = JSON.parse(this._cache[key].block);
			if(itemBlock.data) {
				callback(itemBlock.data);	
				return;
			}
			console.log('itemBlock');
			console.log(typeof(itemBlock));
			this._getBlocksAsItem(itemBlock.blocks,callback);
		} else {
			var self = this;
			console.log('startGetBlock : '+key);
			this._getBlock(key,function(itemBlock) {
				itemBlock = JSON.parse(itemBlock);
				if(itemBlock.data) {
					callback(itemBlock.data);	
					return;
				}
				console.log('itemBlock');
				console.log(itemBlock);
				self._getBlocksAsItem.call(self,itemBlock.blocks,callback);
			});
		}
	},
	/*
	 *
	 * Remove an item from the datastore
	 *
	 */
	remove : function(files,opts) {},
	
	/*
	 *
	 * Get all items for a specific folder
	 *
	 */
	getItems : function(folder,opts) {},
	
	
	
	
	/*
	 *
	 * Get methods that can be called from socket
	 *
	 */
	getSocketMethods : function() {
		
		var methods = {};
		for(var i = 0; i < Datastore.SOCKET_METHODS.length; i++) {
			var name = Datastore.SOCKET_METHODS[i]
			methods[name] = this[name];
		}
		
		return methods;
		
	},
	
	
	
	/*
	 *
	 * Add disk to datastore
	 *
	 */
	addDisk : function() {
		Datastore.addDisk.apply(this,arguments);
	},
	/*
	 *
	 * Remove disk from datastore
	 *
	 */
	removeDisk : function() {
		Datastore.addDisk.apply(this,arguments);
	},
	/*
	 *
	 * Update disk blocks
	 *
	 */
	updateDiskBlocks : function(id,blocks) {
		
		for(var i = 0; i < blocks.length; i++) {
			if(!this._blocks[blocks[i]]) {
				this._blocks[blocks[i]] = {
					'saved' : true,
					'disks' : [id]
				};
			} else {
				this._blocks[blocks[i]].disks.push(id);
			}
		}
		console.log('updateDiskBlocks');
		console.log(this._blocks);
	}
	
	
};

/*
 *
 * "Private" methods
 *
 */

Datastore.prototype._saveItem = function(blocks,size) {
	
	var disk = Datastore._getFreeDisk(size);
	
	if(!disk) return;
	
	for(key in blocks) {
		
		this._cache[key] = {
			'expire' : ((new Date()).getTime() + (Datastore.CACHE_EXPIRE*10000)),
			'block' : blocks[key]
		};
		
		if(!this._blocks[key]) {
			this._blocks[key] = {
				'saved' : false,
				'disks' : []
			};
		}
		
		disk.emit('set', key, blocks[key], function(self,key,disk) {
			return function(space) {
				self._blocks[key].saved = true;
				self._blocks[key].disks.push(disk.id);
				disk.freespace = space.free;
				disk.totalspace = space.total;
				console.log(space);
			};
		}(this,key,disk));
		
	}
	
};

Datastore.prototype._getDiskForBlock = function(key) {
	for(blockKey in this._blocks) {
		var disks = this._blocks[blockKey].disks;
		if(!disks[0]) return null;
		else return Datastore.getDisk(disks[0]);
	}
};

Datastore.prototype._getBlockFromDisk = function(disk, key, callback) {
	var self = this;
	disk.emit('get', key, function(data){
		callback.call(self, data);
	});
};

Datastore.prototype._getBlock = function(key, callback) {
	var self = this;
	var disk = this._getDiskForBlock(key);
	console.log('getBlock');
	if(disk) {
		
		console.log('getBlock disk emit get');
		disk.emit('get', key, function(data){
			console.log('getBlock socket');
			console.log(data);
			callback.call(self, data);
		});
	}
};

Datastore.prototype._getBlocksAsItem = function(blocks,callback) {
	console.log('_getBlocksAsItem');
	console.log(arguments);
	var self = this;
	var parts = [];
	var blocksLoaded = 0;
	for(var i = 0; i < blocks.length; i++) {
		console.log('call getBlock:'+blocks[i]+' index:'+i);
		this._getBlock(blocks[i],function(index) {
			return function(data) {
				console.log('getBlock: '+data);
				parts[index] = data;
				blocksLoaded++;
				if(blocksLoaded == blocks.length) {
					console.log('blocksLoaded');
					callback.call(self,parts.join(''));
				}
			};
		}(i));
	}
};



/*
 *
 * Disks
 *
 */
Datastore._disks = {};

Datastore.addDisk = function(id,socket) {
	Datastore._disks[id] = socket;
};

Datastore.removeDisk = function(id,socket) {
	Datastore._disks[id] = socket;
};

Datastore.getDisk = function(id) {
	return Datastore._disks[id];
};

Datastore.getDisks = function() {
	return Datastore._disks;
};

Datastore._getFreeDisk = function(size) {
	for(var id in Datastore._disks) {
		if(Datastore._disks[id].freespace > size) return Datastore._disks[id];
	}
}


Datastore.checksum=function(m){
	
	function utf8_encode(b){
		// http://kevin.vanzonneveld.net
		// +   original by: Webtoolkit.info (http://www.webtoolkit.info/)
		// +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
		// +   improved by: sowberry
		// +    tweaked by: Jack
		// +   bugfixed by: Onno Marsman
		// +   improved by: Yves Sucaet
		// +   bugfixed by: Onno Marsman
		// +   bugfixed by: Ulrich
		// +   bugfixed by: Rafal Kukawski
		// *     example 1: utf8_encode('Kevin van Zonneveld');
		// *     returns 1: 'Kevin van Zonneveld'

		if(b===null||typeof b==="undefined")return"";b+="";var e="",c,d,g=0;c=d=0;for(var g=b.length,f=0;f<g;f++){var a=b.charCodeAt(f),h=null;a<128?d++:h=a>127&&a<2048?String.fromCharCode(a>>6|192)+String.fromCharCode(a&63|128):String.fromCharCode(a>>12|224)+String.fromCharCode(a>>6&63|128)+String.fromCharCode(a&63|128);h!==null&&(d>c&&(e+=b.slice(c,d)),e+=h,c=d=f+1)}d>c&&(e+=b.slice(c,g));return e
	};
	
	// http://kevin.vanzonneveld.net
    // +   original by: Webtoolkit.info (http://www.webtoolkit.info/)
    // + namespaced by: Michael White (http://getsprink.com)
    // +    tweaked by: Jack
    // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +      input by: Brett Zamir (http://brett-zamir.me)
    // +   bugfixed by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // -    depends on: utf8_encode
    // *     example 1: md5('Kevin van Zonneveld');
    // *     returns 1: '6e658d4bfcb59cc13f96c14450ac40b9'
	var h=function(a,b){var d,c,e,f,g;e=a&2147483648;f=b&2147483648;d=a&1073741824;c=b&1073741824;g=(a&1073741823)+(b&1073741823);return d&c?g^2147483648^e^f:d|c?g&1073741824?g^3221225472^e^f:g^1073741824^e^f:g^e^f},i=function(a,b,d,c,e,f,g){a=h(a,h(h(b&d|~b&c,e),g));return h(a<<f|a>>>32-f,b)},j=function(a,b,d,c,f,e,g){a=h(a,h(h(b&c|d&~c,f),g));return h(a<<e|a>>>32-e,b)},k=function(a,b,c,d,e,f,g){a=h(a,h(h(b^c^d,e),g));return h(a<<f|a>>>32-f,b)},l=function(a,b,c,d,f,e,g){a= h(a,h(h(c^(b|~d),f),g));return h(a<<e|a>>>32-e,b)},n=function(a){var b="",c="",d;for(d=0;d<=3;d++)c=a>>>d*8&255,c="0"+c.toString(16),b+=c.substr(c.length-2,2);return b},f=[],e,o,p,q,r,a,b,d,c,m=utf8_encode(m),f=function(a){var b,c=a.length;b=c+8;for(var d=((b-b%64)/64+1)*16,e=Array(d-1),f=0,g=0;g<c;)b=(g-g%4)/4,f=g%4*8,e[b]|=a.charCodeAt(g)<<f,g++;e[(g-g%4)/4]|=128<<g%4*8;e[d-2]=c<<3;e[d-1]=c>>>29;return e}(m);a=1732584193;b=4023233417;d=2562383102;c=271733878;m=f.length;for(e=0;e<m;e+=16)o= a,p=b,q=d,r=c,a=i(a,b,d,c,f[e+0],7,3614090360),c=i(c,a,b,d,f[e+1],12,3905402710),d=i(d,c,a,b,f[e+2],17,606105819),b=i(b,d,c,a,f[e+3],22,3250441966),a=i(a,b,d,c,f[e+4],7,4118548399),c=i(c,a,b,d,f[e+5],12,1200080426),d=i(d,c,a,b,f[e+6],17,2821735955),b=i(b,d,c,a,f[e+7],22,4249261313),a=i(a,b,d,c,f[e+8],7,1770035416),c=i(c,a,b,d,f[e+9],12,2336552879),d=i(d,c,a,b,f[e+10],17,4294925233),b=i(b,d,c,a,f[e+11],22,2304563134),a=i(a,b,d,c,f[e+12],7,1804603682),c=i(c,a,b,d,f[e+13],12,4254626195),d=i(d,c,a,b, f[e+14],17,2792965006),b=i(b,d,c,a,f[e+15],22,1236535329),a=j(a,b,d,c,f[e+1],5,4129170786),c=j(c,a,b,d,f[e+6],9,3225465664),d=j(d,c,a,b,f[e+11],14,643717713),b=j(b,d,c,a,f[e+0],20,3921069994),a=j(a,b,d,c,f[e+5],5,3593408605),c=j(c,a,b,d,f[e+10],9,38016083),d=j(d,c,a,b,f[e+15],14,3634488961),b=j(b,d,c,a,f[e+4],20,3889429448),a=j(a,b,d,c,f[e+9],5,568446438),c=j(c,a,b,d,f[e+14],9,3275163606),d=j(d,c,a,b,f[e+3],14,4107603335),b=j(b,d,c,a,f[e+8],20,1163531501),a=j(a,b,d,c,f[e+13],5,2850285829),c=j(c,a, b,d,f[e+2],9,4243563512),d=j(d,c,a,b,f[e+7],14,1735328473),b=j(b,d,c,a,f[e+12],20,2368359562),a=k(a,b,d,c,f[e+5],4,4294588738),c=k(c,a,b,d,f[e+8],11,2272392833),d=k(d,c,a,b,f[e+11],16,1839030562),b=k(b,d,c,a,f[e+14],23,4259657740),a=k(a,b,d,c,f[e+1],4,2763975236),c=k(c,a,b,d,f[e+4],11,1272893353),d=k(d,c,a,b,f[e+7],16,4139469664),b=k(b,d,c,a,f[e+10],23,3200236656),a=k(a,b,d,c,f[e+13],4,681279174),c=k(c,a,b,d,f[e+0],11,3936430074),d=k(d,c,a,b,f[e+3],16,3572445317),b=k(b,d,c,a,f[e+6],23,76029189),a= k(a,b,d,c,f[e+9],4,3654602809),c=k(c,a,b,d,f[e+12],11,3873151461),d=k(d,c,a,b,f[e+15],16,530742520),b=k(b,d,c,a,f[e+2],23,3299628645),a=l(a,b,d,c,f[e+0],6,4096336452),c=l(c,a,b,d,f[e+7],10,1126891415),d=l(d,c,a,b,f[e+14],15,2878612391),b=l(b,d,c,a,f[e+5],21,4237533241),a=l(a,b,d,c,f[e+12],6,1700485571),c=l(c,a,b,d,f[e+3],10,2399980690),d=l(d,c,a,b,f[e+10],15,4293915773),b=l(b,d,c,a,f[e+1],21,2240044497),a=l(a,b,d,c,f[e+8],6,1873313359),c=l(c,a,b,d,f[e+15],10,4264355552),d=l(d,c,a,b,f[e+6],15,2734768916), b=l(b,d,c,a,f[e+13],21,1309151649),a=l(a,b,d,c,f[e+4],6,4149444226),c=l(c,a,b,d,f[e+11],10,3174756917),d=l(d,c,a,b,f[e+2],15,718787259),b=l(b,d,c,a,f[e+9],21,3951481745),a=h(a,o),b=h(b,p),d=h(d,q),c=h(c,r);return(n(a)+n(b)+n(d)+n(c)).toLowerCase()};


/*---------------------------------------------------------*/

exports.Datastore = Datastore;