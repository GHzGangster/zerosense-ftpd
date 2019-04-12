const zero = require('zerosense');

var Logger = require('zerosense/Logger');
var MemoryReader = require('zerosense/MemoryReader');
var Searcher = require('zerosense/Searcher');
var Offsets = require('zerosense/Offsets');
var Util = require('zerosense/Util');
var ZsArray = require('zerosense/ZsArray');
var ChainBuilder = require('zerosense/ChainBuilder');

var ZsHelper = require('zerosense/helper/ZsHelper');
var FileSystem = require('zerosense/helper/FileSystem');

var HelperTest = require('./HelperTest.js');
var Net = require('./Net.js');
var NetUtil = require('./NetUtil.js');
var normalize = require('./normalize.js');
var Session = require('./Session.js');

var logger = null;

var DEFAULT_PORT = 9001;


(function() {
	try {		
		var ua = navigator.userAgent;
		
		zero.environment = {};
		zero.environment.ps3 = ua.indexOf("PLAYSTATION 3") !== -1;
		zero.environment.firmware = zero.environment.ps3 ? ua.substr(ua.indexOf("PLAYSTATION 3") + 14, 4)
				: "0.00";
		zero.environment.dex = true;
	
		var log = document.getElementById("log");
		if (log === null) {
			throw new Error("Log element not found.");
		}
	
		logger = zero.logger = new Logger(log);
	} catch (e) {
		alert(e);
		console.error(e, e.name, e.stack);
		return;
	}
	
	try {
		logger.clear();
		
		if (zero.environment.ps3) {
			logger.info(`Detected a PS3 on FW ${zero.environment.firmware} ${zero.environment.dex ? 'DEX' : 'CEX'}.`);
		} else {
			logger.info("No PS3 detected. May not work as expected.");
		}
	
		if (!zero.environment.ps3 || zero.environment.firmware !== "4.84" || !zero.environment.dex) {
			logger.error(`Only 4.84 DEX is supported at the moment.`);
			return;
		}
	
		zero.memoryReader = new MemoryReader();
		zero.searcher = new Searcher(zero.memoryReader);
		zero.offsets = Offsets.get(zero.environment);
		
		Promise.resolve()
			.then(() => ZsHelper.initZsArray())
			.then(() => {
				document.getElementById("buttonStart").addEventListener("click", () => start());
				document.getElementById("buttonStop").addEventListener("click", () => stop());
			})
			.catch((error) => logger.error(`Error while starting. ${error}`));
	} catch (e) {
		if (zero.environment.ps3) {
			alert(e);
		}
		console.error(e, e.name, e.stack);
	}	
})();


///////////////////////////////////////


var bufferAddr = 0x0;

var bufferSizeData = 0x800000;
var bufferSizeCache = 0x100000;

var bufferSize = bufferSizeData + bufferSizeCache;

var ip = null;

var s_server = -1;
var sessions = {};

var transferring = false;

function getServerIP() {
	var result = HelperTest.call_netctl_main_9A528B81();
	var ip = Util.getascii(result.ip, 0, 0x10);
	return ip;
}

function start() {
	logger.info("Starting...");

	Promise.resolve()
		.then(() => {
			if (s_server !== -1) {
				logger.debug(`need to close first`);
				return;
			}
			
			var result = HelperTest.vsh_E7C34044(1);
			var container = result.ret;
			logger.debug(`container: 0x${container.toString(16)}`);
			
			result = HelperTest.sys_memory_allocate_from_container(bufferSize, container, 0x00000200);
			bufferAddr = result.alloc_addr;
			logger.debug(`sys_memory_allocate_from_container: 0x${bufferAddr.toString(16)}`);
			if (bufferAddr === 0x0) {
				return;
			}
			
			var port = DEFAULT_PORT;
			ip = getServerIP();
			logger.info(`Starting server on ${ip}:${port}`);
			logger.info(`Don't forget to run Stop before leaving!`);
			s_server = NetUtil.slisten(port, 2);
			if ((s_server & 0xffffffff) < 0) {
				return;
			}
			
			var fds = NetUtil.fd_zero();
			fds = NetUtil.fd_set(s_server, fds);
			
			var timeout = Util.bin("\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x01"); // 1 microsecond
//			var timeout = Util.bin("\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x03\x0D\x40"); // 200 milliseconds
			//var timeout = Util.bin("\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xF4\x02\x40"); // 1 second
			
			transferring = false;
			listenForConnections({ fds, timeout });
		})
		.then(() => logger.info("Started."))
		.catch((error) => {
			logger.error(`Error while starting. ${error}`);
			console.error(error);
		});
}

function stop() {
	logger.info("Stopping...");

	Promise.resolve()
		.then(() => {
			for (var s_client in sessions) {
				let s = sessions[s_client];
				s.close();
			}
			
			NetUtil.sclose(s_server);
			s_server = -1;
			
			var result = HelperTest.sys_memory_free(bufferAddr);
			var errno = result.errno;
			logger.debug(`sys_memory_free: 0x${errno.toString(16)}`);
		})
		.then(() => logger.info("Stopped."))
		.catch((error) => {
			logger.error(`Error while stopping. ${error}`);
			console.error(error);
		});
}

/**
 * TODO: Optimize
 * 
 * select loops seem to take about 10 ms or so
 * to start up again, might want to use a low
 * timeout (like 5ms?) and while loop a few times
 * 
 * post select to pre recv takes 20 ms
 * fd check could probably be optimized
 * 
 * select executes in 50 ms, should be cached
 * recv executes in 40 ms, should be cached
 * send should be cached as well
 * 
 * This loop might be causing us to crash, something 
 * like a memory or stack issue.
 */
function listenForConnections(r) {
	if (s_server <= 0) {
		logger.debug(`socket is closed`);
		return r;
	}
	
	if (transferring) {
		logger.debug(`busy transferring...`);
		setTimeout(() => listenForConnections(r), 1000);
		return;
	}
	
	var result = Net.sys_net_bnet_select(1024, r.fds, 0, 0, r.timeout);
	var ret = result.ret;
//	logger.debug(`select: 0x${ret.toString(16)}`);
	if ((ret & 0xffffffff) < 0) {
		logger.debug(`select error: 0x${ret.toString(16)}`);
		return r;		  
	} else if (ret > 0) {
		var readfds = result.readfds;

		if (NetUtil.fd_isset(s_server, readfds)) {
			result = Net.sys_net_bnet_accept(s_server);
			ret = result.ret;
			logger.debug(`accept: 0x${ret.toString(16)}`);
			if ((ret & 0xffffffff) < 0) {
				logger.debug(`accept error: 0x${ret.toString(16)}`);
				return r;
			}
			
			result = HelperTest.sys_net_get_sockinfo(ret, 0, 1);
			var info = result.info;
			let ip = Util.getint32(info, 0x10);
			let localIp = ((ip >> 24) & 0xff) + "." + ((ip >> 16) & 0xff) + "." + ((ip >> 8) & 0xff) + "." + (ip & 0xff);
			
			let s_client = ret;
			let s = new Session(bufferAddr, bufferSizeData);
			s.open(s_client, localIp);
			
			sessions[s.s_client] = s;
			r.fds = NetUtil.fd_set(s.s_client, r.fds);
			setSocketOptions(s.s_client);
			
			onSessionOpened(s);
		} else {
			let s = null;
			for (var s_client in sessions) {
				if (NetUtil.fd_isset(s_client, readfds)) {
					s = sessions[s_client];
					break;
				}
			}
			
			if (s) {
				result = Net.sys_net_bnet_recvfrom(s.s_client, s.bufferAddr, s.bufferSize, 0, 0, 0);
				ret = result.ret;
				logger.debug(`recv: 0x${ret.toString(16)}`);
				
				if ((ret & 0xffffffff) <= 0) {
					r.fds = NetUtil.fd_clr(s.s_client, r.fds);
					
					s.close();
					delete sessions[s.s_client];
				} else {
					var bufstr = s.recvStr(ret);
					bufstr = bufstr.substr(0, bufstr.indexOf("\r\n"));
					
					var command = null, param = null;
					var index = bufstr.indexOf(" ");
					if (index !== -1) {
						command = bufstr.substr(0, index);
						param = bufstr.substr(index + 1);
					} else {
						command = bufstr;
					}
					
					onCommandReceived(s, command, param);
				}
			}
			
			// TODO: Maybe handle data sockets here
		}
		
	}
	
	setTimeout(() => listenForConnections(r), 1);
}

function setSocketOptions(s) {
	// Set SNDBUF to 512KB
	var optval = Util.int32(512000);
	HelperTest.sys_net_bnet_setsockopt(s, 0xffff, 0x1001, optval, 4);
	
	// Set RCVBUF to 512KB
	optval = Util.int32(512000);
	HelperTest.sys_net_bnet_setsockopt(s, 0xffff, 0x1002, optval, 4);
	
	// Disable Nagle's Algorithm
	optval = Util.int32(1);
	HelperTest.sys_net_bnet_setsockopt(s, 0x6, 0x1, optval, 4);
}

function onSessionOpened(s) {
	logger.debug(s.localIp);
	s.sendStr("220-zerosense-ftpd\r\n"
		+ "220 Features: a .\r\n");
}

function onCommandReceived(s, command, param) {	
	if (param !== null) {
		logger.debug(`${command} ${param}`);
	} else {
		logger.debug(`${command}`);
	}
	
	switch (command) {
		case "USER":
		case "PASS":
			s.sendStr("230 User logged in, proceed.\r\n");
			break;
			
		case "SYST":
			s.sendStr("215 UNIX system type.\r\n");
			break;
		
		case "FEAT":
			s.sendStr("211-Extensions supported:\r\n"
				+ " SIZE\r\n"
				+ " MDTM\r\n"
				+ " PORT\r\n"
				+ " CDUP\r\n"
				+ " ABOR\r\n"
				+ " PASV\r\n"
				+ " LIST\r\n"
				+ " MLSD\r\n"
				+ " MLST type*;size*;modify*;UNIX.mode*;UNIX.uid*;UNIX.gid*;\r\n"
				+ "211 End\r\n");
			break;
		
		case "PWD":
			s.sendStr(`257 "${s.cwd}" is your current location.\r\n`);
			break;
		
		case "TYPE":
			s.sendStr("200 Command okay.\r\n");
			break;
		
		case "PASV":
			handlePASV(s);
			break;
		
		case "MLSD":
			handleMLSD(s, command, param);
			break;
		
		case "CWD":
			if (param.charAt(0) === "/") {
				s.cwd = normalize(param + "/");
			} else {
				s.cwd = normalize(s.cwd + param + "/");
			}
			logger.debug(`cwd is now ${s.cwd}`);
			s.sendStr(`250 Requested file action okay, completed.\r\n`);
			break;
		
		case "CDUP":
			s.cwd = normalize(s.cwd + "../");
			s.sendStr(`250 Requested file action okay, completed.\r\n`);
			break;
		
		case "STOR":
			handleSTOR(s, command, param);
			break;
		
		case "DELE":
			handleDelete(s, param);
			break;
		
		default:
			logger.debug(`command not implemented`);
			s.sendStr("502 Command not implemented.\r\n");
	}
}


//////////////////////////


function handlePASV(s) {
	var pasv_port = getRandomIntInclusive(32768, 65528);
	var p1x = ((pasv_port & 0xff00) >> 8) | 0x80;
	var p2x = pasv_port & 0xff;
	let port = getPort(p1x, p2x);
	
	var pasv_s = NetUtil.slisten(port, 1);
	if ((pasv_s & 0xffffffff) < 0) {
		logger.debug(`pasv listen: 0x${pasv_s.toString(16)}`);
		return;
	}
	s.s_pasv = pasv_s;
	
	var pasv_ip = s.localIp.replace(/\./g, ',');
	s.sendStr(`227 Entering Passive Mode (${pasv_ip},${p1x},${p2x}).\r\n`);
}

function handleMLSD(s, command, param) {
	// TODO: Should we accept from the select loop?
	
	if (s.s_pasv === -1) {
		logger.error(`s_pasv not ready`);
		return;
	}
	
	var result = Net.sys_net_bnet_accept(s.s_pasv);
	var ret = result.ret;
	logger.debug(`pasv accept: 0x${ret.toString(16)}`);
	if ((ret & 0xffffffff) < 0) {
		logger.error(`pasv accept error: 0x${ret.toString(16)}`);
		return;
	}
	s.openData(ret);
	setSocketOptions(s.s_data);
	
	
	result = FileSystem.opendir(s.cwd);
	var errno = result.errno;
	var fd = result.fd;
	
	var data = "";
	
	if (errno === 0) {
		s.sendStr("150 OK\r\n");
		
		let filename = null;
		do {
			result = FileSystem.readdir(fd);
			errno = result.errno;
			filename = result.name;
			if (filename.length === 0) {
				break;
			}
			
			var path = s.cwd + filename;
			if (path === "/app_home" || path === "/host_root") {
				continue;
			}
			
			result = FileSystem.fstat(path);
			errno = result.errno;
			var st = result.sb;
			
			var st_mode = Util.getint32(st, 0x0);
			var st_mtime = Util.getint32(st, 0x10);
			var st_size = Util.getint32(st, 0x28);
			
			var isDir = (st_mode & 0o40000) !== 0;
			var date = new Date(st_mtime * 1000);
			var unixMode = st_mode & 0o777;
			
			var e = "type=" + (filename === "." ? "c" : filename === ".." ? "p" : "")
					+ (isDir ? "dir" : "file")
				+ ";siz" + (isDir ? "d" : "e") + "=" + st_size
				+ ";modify=" +  pad(date.getFullYear(), 4) + pad(date.getMonth() + 1, 2)
					+ pad(date.getDate(), 2) + pad(date.getHours(), 2) + pad(date.getMinutes(), 2)
					+ pad(date.getSeconds(), 2)
				+ ";UNIX.mode=" + pad(unixMode.toString(8), 4)
				+ ";UNIX.uid=root;UNIX.gid=root; "
				+ filename + "\r\n";
			
			data += e;
		} while (filename.length > 0);
		
		result = FileSystem.closedir(fd);
		errno = result.errno;
		
		s.sendStrData(data);
		
		s.sendStr("226 OK\r\n");
	} else {
		s.sendStr("550 ERR\r\n");
	}
	
	s.closeData();
}

function handleSTOR(s, command, param) {
	if (s.s_pasv === -1) {
		logger.error(`s_pasv not ready`);
		return;
	}
	
	var result = Net.sys_net_bnet_accept(s.s_pasv);
	var ret = result.ret;
	logger.debug(`pasv accept: 0x${ret.toString(16)}`);
	if ((ret & 0xffffffff) < 0) {
		logger.error(`pasv accept error: 0x${ret.toString(16)}`);
		return;
	}
	s.openData(ret);
	setSocketOptions(s.s_data);
	
	
	s.sendStr("150 OK\r\n");
	
	var path = s.cwd + param;
	
	result = FileSystem.open(path, 0o102, 0o777);
	var errno = result.errno;
	var fd = result.fd;
	logger.debug(`open: 0x${errno.toString(16)}`);
	
	var bufsize = 0x40000;
	
	var chainRecv = HelperTest.createRecvFrom(s.s_data, s.bufferAddr, bufsize, 0x40, 0, 0);
	result = cacheChain(chainRecv, s.bufferAddr + s.bufferSize);
	//var addrRecvRet = result.dataAddr + chainRecv.getDataOffset("ret");
	// Need to load r3 into r5
	
	var chainWrite = HelperTest.createWritePtr(fd, s.bufferAddr, bufsize);
	result = cacheChain(chainWrite, s.bufferAddr + s.bufferSize + 0x1000);
	
	transferring = true;
	
	var data = { s, fd, chainRecv, chainWrite, bufsize };
	loopSTOR(data).then(() => {
		result = FileSystem.close(fd);
		errno = result.errno;
		logger.debug(`close: 0x${errno.toString(16)}`);
		
		s.sendStr("226 OK\r\n");
		
		
		s.closeData();
		
		transferring = false;
	});
}

function loopSTOR(data) {
	return new Promise((resolve) => {
		var time = 0;
		
		var keepGoing = true;
		
		var runTime = 0;
		while (runTime < 5000) {
			let runStart = new Date().getTime();
			
			time = new Date().getTime();
			var result = HelperTest.executeRecvFrom(data.chainRecv);
			var ret = result.ret;
			time = new Date().getTime() - time;
			logger.debug(`stor recv: 0x${ret.toString(16)} -- took ${time} ms`);
			
			let written = 0;
			
			if ((ret & 0xffffffff) > 0) {
				time = new Date().getTime();
				
				let cached = false;
				if (ret === data.bufsize) {
					cached = true;
					result = HelperTest.executeWritePtr(data.chainWrite);
				} else {
					result = FileSystem.writePtr(data.fd, data.s.bufferAddr, ret);
				}
				
				var errno = result.errno;
				written = result.written;
				time = new Date().getTime() - time;
				
				logger.debug(`stor write: 0x${errno.toString(16)} -- took ${time} ms`);
				logger.debug(`stor written: 0x${written.toString(16)} -- cached: ${cached}`);
			}
			
			if ((ret & 0xffffffff) <= 0 || written <= 0) {
				keepGoing = false;
				break;
			}
			
			runTime += new Date().getTime() - runStart;
		}
		
		if (keepGoing) {
			setTimeout(() => resolve(loopSTOR(data)), 1);
		} else {
			logger.debug(`stor stop`);
			setTimeout(() => resolve(data), 1);
		}
	});
}

function handleDelete(s, filename) {	
	var path = s.cwd + filename;
	logger.debug(path);
	
	var result = HelperTest.sys_fs_unlink(path);
	var errno = result.errno;
	logger.debug(`dele unlink: 0x${errno.toString(16)}`);
	if ((errno & 0xffffffff) > 0) {
		s.sendStr("550 Requested action not taken; file unavailable.\r\n");
		return;
	}

	s.sendStr(`250 Requested file action okay, completed.\r\n`);
}


//////////////////////////


function getPort(p1x, p2x) {
	return (p1x * 256) + p2x;
}

function getRandomIntInclusive(min, max) {
	var _min = Math.ceil(min);
	var _max = Math.floor(max);
	return Math.floor(Math.random() * (_max - _min + 1)) + _min;
}

function pad(val, targetLength) {
    var output = null;
    if (typeof val === "number") {
		output = val.toString();
    } else {
		output = val;
    }
    while (output.length < targetLength) {
        output = '0' + output;
    }
    return output;
}


//////////////////////////


function cacheChain(chain, cacheStart) {
	var cacheAddr = cacheStart;

	var data = chain.cb.getData();
	var dataSize = data.length * 2;
	var dataAddr = zero.zsArray.getAddress(data);
	chain.cb.updateDataAddress(dataAddr);
	
	var stack = chain.cb.getChain();
	var stackSize = stack.length * 2;
	var stackAddr = zero.zsArray.getAddress(stack);
	var stackCacheAddr = cacheAddr;
	cacheAddr += stackSize;
	if ((cacheAddr % 0x10) > 0) {
		cacheAddr += 0x10 - (cacheAddr % 0x10);
	}
	
	var setup2 = chain.setup2Make(stackCacheAddr + 0x4);
	var setup2Size = setup2.length * 2;
	var setup2Addr = zero.zsArray.getAddress(setup2);
	var setup2CacheAddr = cacheAddr;
	cacheAddr += setup2Size;
	if ((cacheAddr % 0x10) > 0) {
		cacheAddr += 0x10 - (cacheAddr % 0x10);
	}
	
	var setup1 = chain.setup1Make(setup2CacheAddr);
	var setup1Size = setup1.length * 2;
	var setup1Addr = zero.zsArray.getAddress(setup1);
	var setup1CacheAddr = cacheAddr;
	cacheAddr += setup1Size;
	if ((cacheAddr % 0x10) > 0) {
		cacheAddr += 0x10 - (cacheAddr % 0x10);
	}
	
	HelperTest.memcpy(stackCacheAddr, stackAddr, stackSize);
	HelperTest.memcpy(setup2CacheAddr, setup2Addr, setup2Size);
	HelperTest.memcpy(setup1CacheAddr, setup1Addr, setup1Size);
	
	chain.addrChainStart = setup1CacheAddr;
	
	return { dataAddr, stackCacheAddr, setup2CacheAddr, setup1CacheAddr };
}
