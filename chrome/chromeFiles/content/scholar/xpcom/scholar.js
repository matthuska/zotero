const SCHOLAR_CONFIG = {
	GUID: 'scholar@chnm.gmu.edu',
	DB_FILE: 'scholar.sqlite',
	DB_REBUILD: false, // erase DB and recreate from schema
	DEBUG_LOGGING: true,
	DEBUG_TO_CONSOLE: true, // dump debug messages to console rather than (much slower) Debug Logger
	REPOSITORY_URL: 'http://chnm.gmu.edu/firefoxscholar/dev/repo'
};

/*
 * Core functions
 */
var Scholar = new function(){
	var _initialized = false;
	var _localizedStringBundle;
	
	// Privileged (public) methods
	this.init = init;
	this.debug = debug;
	this.varDump = varDump;
	this.getString = getString;
	this.flattenArguments = flattenArguments;
	this.join = join;
	this.randomString = randomString;
	this.getRandomID = getRandomID;
	
	/*
	 * Initialize the extension
	 */
	function init(){
		if (_initialized){
			return false;
		}
		
		Scholar.Schema.updateSchema();
		
		// Load in the localization stringbundle for use by getString(name)
		var src = 'chrome://scholar/locale/scholar.properties';
		var localeService =
			Components.classes["@mozilla.org/intl/nslocaleservice;1"]
			.getService(Components.interfaces.nsILocaleService);
		var appLocale = localeService.getApplicationLocale();
		var stringBundleService =
			Components.classes["@mozilla.org/intl/stringbundle;1"]
			.getService(Components.interfaces.nsIStringBundleService);
		_localizedStringBundle = stringBundleService.createBundle(src, appLocale);
		
		_initialized = true;
		return true;
	}
	
	
	/*
	 * Debug logging function
	 *
	 * Uses DebugLogger extension available from http://mozmonkey.com/debuglogger/
	 * if available, otherwise the console (in which case boolean browser.dom.window.dump.enabled
	 * must be created and set to true in about:config)
	 *
	 * Defaults to log level 3 if level not provided
	 */
	function debug(message, level) {
		if (!SCHOLAR_CONFIG['DEBUG_LOGGING']){
			return false;
		}
		
		if (typeof message!='string'){
			message = Scholar.varDump(message);
		}
		
		if (!level){
			level = 3;
		}
		
		if (!SCHOLAR_CONFIG['DEBUG_TO_CONSOLE']){
			try {
				var logManager =
				Components.classes["@mozmonkey.com/debuglogger/manager;1"]
				.getService(Components.interfaces.nsIDebugLoggerManager);
				var logger = logManager.registerLogger("Firefox Scholar");
			}
			catch (e){}
		}
		
		if (logger){
			logger.log(level, message);
		}
		else {
			dump('scholar(' + level + '): ' + message + "\n\n");
		}
		return true;
	}
	
	
	/**
	 * PHP var_dump equivalent for JS
	 *
	 * Adapted from http://binnyva.blogspot.com/2005/10/dump-function-javascript-equivalent-of.html
	 */
	function varDump(arr,level) {
		var dumped_text = "";
		if (!level){
			level = 0;
		}
		
		// The padding given at the beginning of the line.
		var level_padding = "";
		for (var j=0;j<level+1;j++){
			level_padding += "    ";
		}
		
		if (typeof(arr) == 'object') { // Array/Hashes/Objects
			for (var item in arr) {
				var value = arr[item];
				
				if (typeof(value) == 'object') { // If it is an array,
					dumped_text += level_padding + "'" + item + "' ...\n";
					dumped_text += arguments.callee(value,level+1);
				}
				else {
					if (typeof value == 'function'){
						dumped_text += level_padding + "'" + item + "' => function(...){...} \n";
					}
					else {
						dumped_text += level_padding + "'" + item + "' => \"" + value + "\"\n";
					}
				}
			}
		}
		else { // Stings/Chars/Numbers etc.
			dumped_text = "===>"+arr+"<===("+typeof(arr)+")";
		}
		return dumped_text;
	}
	
	
	function getString(name){
		return _localizedStringBundle.GetStringFromName(name);
	}
	
	
	/*
	 * Flattens mixed arrays/values in a passed _arguments_ object and returns
	 * an array of values -- allows for functions to accept both arrays of
	 * values and/or an arbitrary number of individual values
	 */
	function flattenArguments(args){
		// Put passed scalar values into an array
		if (typeof args!='object'){
			args = [args];
		}
		
		var returns = new Array();
		
		for (var i=0; i<args.length; i++){
			if (typeof args[i]=='object'){
				for (var j=0; j<args[i].length; j++){
					returns.push(args[i][j]);
				}
			}
			else {
				returns.push(args[i]);
			}
		}
		
		return returns;
	}
	
	
	/*
	 * A version of join() that operates externally for use on objects other
	 * than arrays (e.g. _arguments_)
	 *
	 * Note that this is safer than extending Object()
	 */
	function join(obj, delim){
		var a = [];
		for (var i=0, len=obj.length; i<len; i++){
			a.push(obj[i]);
		}
		return a.join(delim);
	}
	
	
	/**
	* Generate a random string of length 'len' (defaults to 8)
	**/
	function randomString(len) {
		var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";
		if (!len){
			len = 8;
		}
		var randomstring = '';
		for (var i=0; i<len; i++) {
			var rnum = Math.floor(Math.random() * chars.length);
			randomstring += chars.substring(rnum,rnum+1);
		}
		return randomstring;
	}
	
	
	/**
	* Find a unique random id for use in a DB table
	**/
	function getRandomID(table, column, max){
		if (!table){
			throw('SQL query not provided');
		}
		
		if (!column){
			throw('SQL query not provided');
		}
		
		var sql = 'SELECT COUNT(*) FROM ' + table + ' WHERE ' + column + '=';
		
		if (!max){
			max = 16383;
		}
		
		var tries = 10; // # of tries to find a unique id
		do {
			// If no luck after number of tries, try a larger range
			if (!tries){
				max = max * 2;
			}
			var rnd = Math.floor(Math.random()*max);
			var exists = Scholar.DB.valueQuery(sql + rnd);
			tries--;
		}
		while (exists);
		
		return rnd;
	}
};




/**
* Class for creating hash arrays that behave a bit more sanely
*
*   Hashes can be created in the constructor by alternating key and val:
*
*   var hasharray = new Scholar.Hash('foo','foovalue','bar','barvalue');
*
*   Or using hasharray.set(key, val)
*
*   _val_ defaults to true if not provided
*
*   If using foreach-style looping, be sure to use _for (i in arr.items)_
*   rather than just _for (i in arr)_, or else you'll end up with the
*   methods and members instead of the hash items
*
*   Most importantly, hasharray.length will work as expected, even with
*   non-numeric keys
*
* Adapated from http://www.mojavelinux.com/articles/javascript_hashes.html
* (c) Mojavelinux, Inc.
* License: Creative Commons
**/
Scholar.Hash = function(){
	this.length = 0;
	this.items = new Array();
	
	// Public methods defined on prototype below
	
	for (var i = 0; i < arguments.length; i += 2) {
		if (typeof(arguments[i + 1]) != 'undefined') {
			this.items[arguments[i]] = arguments[i + 1];
			this.length++;
		}
	}
}

Scholar.Hash.prototype.get = function(in_key){
	return this.items[in_key];
}

Scholar.Hash.prototype.set = function(in_key, in_value){
	// Default to a boolean hash if value not provided
	if (typeof(in_value) == 'undefined'){
		in_value = true;
	}
	
	if (typeof(this.items[in_key]) == 'undefined') {
		this.length++;
	}
	
	this.items[in_key] = in_value;
	
	return in_value;
}

Scholar.Hash.prototype.remove = function(in_key){
	var tmp_value;
	if (typeof(this.items[in_key]) != 'undefined') {
		this.length--;
		var tmp_value = this.items[in_key];
		delete this.items[in_key];
	}
	
	return tmp_value;
}

Scholar.Hash.prototype.has = function(in_key){
	return typeof(this.items[in_key]) != 'undefined';
}



Scholar.HTTP = new function(){
	
	this.doGet = doGet;
	this.doPost = doPost;
	
	function doGet(url, onStatus, onDone){
		var xmlhttp = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
					.createInstance();
		
		xmlhttp.open('GET', url, true);
		
		xmlhttp.onreadystatechange = function(){
			_stateChange(xmlhttp, onStatus, onDone);
		};
		xmlhttp.send(null);
	}
	
	
	function doPost(url, body, onStatus, onDone){
		var xmlhttp = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
					.createInstance();
		
		xmlhttp.open('POST', url, true);
		
		xmlhttp.onreadystatechange = function(){
			_stateChange(xmlhttp, onStatus, onDone);
		};
		xmlhttp.send(body);
	}
	
	
	function _stateChange(xmlhttp, onStatus, onDone){
		switch (xmlhttp.readyState){
	
			// Request not yet made
			case 1:
			break;
	
			// Contact established with server but nothing downloaded yet
			case 2:
				try {
					// Check for HTTP status 200
					if (xmlhttp.status != 200){
						if (onStatus) {
							onStatus(
								xmlhttp.status,
								xmlhttp.statusText,
								xmlhttp
							);
							xmlhttp.abort();
						}
					}
				}
				catch (e){
					Scholar.debug(e, 2);
				}
			break;
	
			// Called multiple while downloading in progress
			case 3:
			break;
	
			// Download complete
			case 4:
				try {
					if (onDone){
						onDone(xmlhttp);
					}
				}
				catch (e){
					Scholar.debug(e, 2);
				}
			break;
		}
	}
}



Scholar.Date = new function(){
	this.sqlToDate = sqlToDate;
	
	/**
	* Convert an SQL date in the form '2006-06-13 11:03:05' into a JS Date object
	*
	* Can also accept just the date part (e.g. '2006-06-13')
	**/
	function sqlToDate(sqldate){
		try {
			var datetime = sqldate.split(' ');
			var dateparts = datetime[0].split('-');
			if (datetime[1]){
				var timeparts = datetime[1].split(':');
			}
			else {
				timeparts = [false, false, false];
			}
			return new Date(dateparts[0], dateparts[1]-1, dateparts[2],
				timeparts[0], timeparts[1], timeparts[2]);
		}
		catch (e){
			Scholar.debug(sqldate + ' is not a valid SQL date', 2)
			return false;
		}
	}
}