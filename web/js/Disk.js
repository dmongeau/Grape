// JavaScript Document

var Disk = function(name, size) {
	
	if(!Disk.isCompatible()) return null;
	
	this._name = name;
	this._totalspace = !size || size == -1 ? Disk.getFreeSpace():size;
	this._freespace = this._totalspace;
	this._method = Disk.getBestMethod();
	this._blocks = {};
	
	if(this._totalspace > Disk.getFreeSpace()) throw new Exception('Not enough space left on '+this._method);
	
	Disk.mount(name,this);
	
};
/*
 *
 * Methods
 *
 */
Disk.prototype = {
	
	exists : function(name) {
		return this.get(name) == null ? false:true;;
	},
	
	set : function(key,data) {
		
		key = key.substr(0,1) == '/' ? key.substr(1):key;
		keyStorage = '//'+this._name+'/'+key;
		console.log('save '+this._method);
		var actualValue = this.get(key);
		var length = actualValue == null ? 0:actualValue.length;
		try {
			switch(this._method) {
				
				case 'sessionStorage':
				case 'localStorage':
					window[this._method].setItem(keyStorage,data);
					console.log('setItem '+keyStorage+' » '+data);
				break;
				case 'globalStorage':
					window[this._method][keyStorage] = data;
					console.log('globalStorage '+keyStorage+' » '+data);
				break;
				
			}
			this._blocks[key] = data;
			length = data.length-length;
			this._freespace -= length;
			console.log(this._blocks);
		} catch(e) {
			console.log(e);	
		}
		
	},
	
	get : function(key) {
		
		key = key.substr(0,1) == '/' ? key.substr(1):key;
		keyStorage = '//'+this._name+'/'+key;
		
		if(this._blocks[key]) return this._blocks[key];
		
		try {
			switch(this._method) {
				
				case 'sessionStorage':
				case 'localStorage':
					var data = window[this._method].getItem(keyStorage);
					this._blocks[key] = data;
					return data;
				break;
				case 'globalStorage':
					var data = window[this._method][keyStorage];
					this._blocks[key] = data;
					return data;
				break;
				
			}
		} catch(e) {
			return null;
		}
		
	},
	
	
	
	getBlocks : function() {
		return this._blocks;
	},
	
	getBlockKeys : function() {
		var keys = [];
		for(var key in this._blocks) {
			keys.push(key);
		}
		return keys;
	},
	
	
	
	
	getFreeSpace : function() {
		return this._freespace;
	},
	
	getTotalSpace : function() {
		return this._totalspace;
	}
	
	
	
};

/*
 *
 * Statics
 *
 */
Disk._disks = {};
Disk.isCompatible = function() {
	
	if(!window.localStorage && !window.sessionStorage && !window.globalStorage) return false;
	return true;
	
};
Disk.getBestMethod = function() {
	
	if(window.localStorage) return 'localStorage';
	else if(window.globalStorage) return 'globalStorage';
	else if(window.sessionStorage) return 'sessionStorage';
	
};

Disk.getFreeSpace = function() {
	try {
		var str = '0';
		var lastStr = '';
		for(var i = 0; i < 50; i++) {
			window.localStorage.setItem('_test',str);
			lastStr = str;
			str += str;
		}
	} catch(e) {
		window.localStorage.removeItem('_test');
		return lastStr.length;
	}
};

Disk.mount = function(name,disk) {
	var method = Disk.getBestMethod();
	var diskName = '//'+name+'/';
	for(key in window[method]) {
		if(key.substr(0,diskName.length) == diskName) {
			var blockKey = key.substr(diskName.length)
			disk._blocks[blockKey] = window[method][key];
			disk._freespace -= window[method][key].length;
		}
	}
	Disk._disks[name] = disk;
};
Disk.unmount = function(name) {
	Disk._disks[name] = null;	
};
Disk.get = function(name) {
	return !Disk._disks[name] ? null:Disk._disks[name];	
};

Disk._zip = function(data) {
	var zip = new JSZip();
	zip.add("data",data);
	return zip.generate();
};