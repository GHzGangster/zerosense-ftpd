var zero = require('zerosense');

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
var normalize = require('./normalize.js');

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
				var buttonFolderTest = document.getElementById("buttonFolderTest");
				buttonFolderTest.addEventListener("click", () => folderTest());
				
				var buttonFolderTest2 = document.getElementById("buttonFolderTest2");
				buttonFolderTest2.addEventListener("click", () => folderTest2());
			})
			.catch((error) => logger.error(`Error while starting. ${error} ... If ZsArray is no longer valid, refresh the page.`));
	} catch (e) {
		if (zero.environment.ps3) {
			alert(e);
		}
		console.error(e, e.name, e.stack);
	}	
})();


///////////////////////////////////////


function fd_zero() {
	return Util.pad(0x80);
}

function fd_set(fd, fds) {
	var fd_off = (fd >> 5) * 4;
	var fd_val = Util.getint32(fds, fd_off) | (1 << (fd & 0x1f));
	return Util.setint32(fds, fd_off, fd_val);
}

function fd_clr(fd, fds) {
	var fd_off = (fd >> 5) * 4;
	var fd_val = Util.getint32(fds, fd_off) & ~(1 << (fd & 0x1f));
	return Util.setint32(fds, fd_off, fd_val);
}

function fd_isset(fd, fds) {
	var fd_off = (fd >> 5) * 4;
	var fd_val = Util.getint32(fds, fd_off) & (1 << (fd & 0x1f));
	return fd_val !== 0;
}

function slisten(port, backlog) {
	var result = Net.sys_net_bnet_socket(2, 1, 0);
	var s = result.ret;
	logger.debug(`socket: 0x${s.toString(16)}`);
	
	var sa = Util.bin("\x00\x02") + Util.int16(port) + Util.bin("\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00");
	result = Net.sys_net_bnet_bind(s, sa, 0x10);
	var ret = result.ret;
	logger.debug(`bind: 0x${ret.toString(16)}`);
	if ((ret & 0xffffffff) < 0) {
		return ret;
	}
	
	result = Net.sys_net_bnet_listen(s, backlog);
	ret = result.ret;
	logger.debug(`listen: 0x${ret.toString(16)}`);
	if ((ret & 0xffffffff) < 0) {
		return ret;
	}
	
	return s;
}

function sclose(fd) {
	var result = Net.sys_net_bnet_shutdown(fd, 2);
	var ret = result.ret;
	logger.debug(`shutdown: 0x${ret.toString(16)}`);
	if ((ret & 0xffffffff) < 0) {
		return ret;
	}
	
	result = Net.sys_net_bnet_close(fd);
	ret = result.ret;
	logger.debug(`close: 0x${ret.toString(16)}`);
	if ((ret & 0xffffffff) < 0) {
		return ret;
	}
	
	return 0;
}

var ip = null;
var s = -1, s_pasv = -1, s_data = -1;

function getServerIP() {
	var result = HelperTest.call_netctl_main_9A528B81();
	var ip = Util.getascii(result.ip, 0, 0x10);
	return ip;
}

function folderTest() {
	logger.info("Starting test...");

	Promise.resolve()
		.then(() => {
			if (s !== -1) {
				logger.debug(`need to close first`);
				return;
			}
			
			var port = DEFAULT_PORT;
			ip = getServerIP();
			logger.info(`Starting server on ${ip}:${port}`);
			logger.info(`Don't forget to run Stop before leaving!`);
			s = slisten(port, 2);
			if ((s & 0xffffffff) < 0) {
				return;
			}			
			
			var fds = fd_zero();
			fds = fd_set(s, fds);
			
			var timeout = Util.bin("\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x01"); // 1 microsecond ms
//			var timeout = Util.bin("\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x03\x0D\x40"); // 200 ms
			//var timeout = Util.bin("\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xF4\x02\x40"); // 1 second
			
			listenForConnections({ fds, timeout });
		})
		.then(() => logger.info("Test done."))
		.catch((error) => {
			logger.error(`Error while running test. ${error}`);
			console.error(error);
		});
}

function folderTest2() {
	logger.info("Starting test 2...");

	Promise.resolve()
		.then(() => {
			var result = Net.sys_net_bnet_shutdown(s, 2);
			var ret = result.ret;
			logger.debug(`shutdown: 0x${ret.toString(16)}`);
			
			result = Net.sys_net_bnet_close(s);
			ret = result.ret;
			logger.debug(`close: 0x${ret.toString(16)}`);
			
			s = -1;
		})
		.then(() => logger.info("Test 2 done."))
		.catch((error) => {
			logger.error(`Error while running test 2. ${error}`);
			console.error(error);
		});
}

var cwd = "/";

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
 */
function listenForConnections(r) {
	return new Promise((resolve) => {
		setTimeout(() => resolve(r), 0);
	}).then((r) => {
		if (s <= 0) {
			logger.debug(`socket is closed`);
			return r;
		}
		
		var result = Net.sys_net_bnet_select(1024, r.fds, 0, 0, r.timeout);
		var ret = result.ret;
//		logger.debug(`select: 0x${ret.toString(16)}`);
		if ((ret & 0xffffffff) < 0) {
			logger.debug(`select error: 0x${ret.toString(16)}`);
			return r;		  
		} else if (ret > 0) {
			var readfds = result.readfds;

			for (var i = 0; i < 1024; i++) {
				if (fd_isset(i, readfds)) {
					if (i === s) {
						result = Net.sys_net_bnet_accept(s);
						ret = result.ret;
						logger.debug(`accept: 0x${ret.toString(16)}`);
						if ((ret & 0xffffffff) < 0) {
							logger.debug(`accept error: 0x${ret.toString(16)}`);
							return r;
						}
						
						var sc = ret;
						r.fds = fd_set(sc, r.fds);
						
						cwd = "/";
						connectionSendStr(sc, "220 zerosense-ftpd\r\n");
					} else {
						var bufAddr = 0x8d004000;
						var bufLength = 0x1000;
						result = Net.sys_net_bnet_recvfrom(i, bufAddr, bufLength, 0, 0, 0);
						ret = result.ret;
						logger.debug(`recv: 0x${ret.toString(16)}`);
						
						if ((ret & 0xffffffff) <= 0) {							
							sclose(i);
							r.fds = fd_clr(i, r.fds);
						} else {							
							var bufstr = messageReadStr(bufAddr, ret);
							bufstr = bufstr.substr(0, bufstr.indexOf("\r\n"));
							
							var command = null, param = null;
							var index = bufstr.indexOf(" ");
							if (index !== -1) {
								command = bufstr.substr(0, index);
								param = bufstr.substr(index + 1);
							} else {
								command = bufstr;
							}
							
							if (param !== null) {
								logger.debug(`${command} ${param}`);
							} else {
								logger.debug(`${command}`);
							}
							
							if (command === "AUTH") {
								connectionSendStr(i, "502 Not implemented\r\n");
							} else if (command === "USER" || command === "PASS") {
								connectionSendStr(i, "230 Already in\r\n");
							} else if (command === "SYST") {
								connectionSendStr(i, "215 UNIX Type: L8\r\n");
							} else if (command === "FEAT") {
								connectionSendStr(i, "211-Ext:\r\n"
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
							} else if (command === "PWD") {
								connectionSendStr(i, `257 "${cwd}"\r\n`);
							} else if (command === "TYPE") {
								connectionSendStr(i, "200 TYPE OK\r\n");
							} else if (command === "PASV") {
								var pasv_port = getRandomIntInclusive(32768, 65528);								
								var p1x = ((pasv_port & 0xff00) >> 8) | 0x80;
								var p2x = pasv_port & 0xff;
								var port = getPort(p1x, p2x);
								var pasv_s = slisten(port, 1);
								if ((pasv_s & 0xffffffff) > 0) {
									var pasv_ip = ip.replace(/\./g, ',');
									connectionSendStr(i, `227 Entering Passive Mode (${pasv_ip},${p1x},${p2x})\r\n`);
									
									result = Net.sys_net_bnet_accept(pasv_s);
									ret = result.ret;
									logger.debug(`pasv accept: 0x${ret.toString(16)}`);
									if ((ret & 0xffffffff) < 0) {
										logger.debug(`accept error: 0x${ret.toString(16)}`);
									} else {
										s_pasv = pasv_s;
										s_data = ret;
									}
								}
							} else if (command === "MLSD") {
								handleMLSD(i, command, param);
							} else if (command === "CWD") {
								if (param.charAt(0) === "/") {
									cwd = normalize(param + "/");
								} else {
									cwd = normalize(cwd + param + "/");
								}
								logger.debug(`cwd is now ${cwd}`);
								connectionSendStr(i, `250 OK\r\n`);
							} else if (command === "CDUP") {
								let index = cwd.substr(0, cwd.length - 1).lastIndexOf("/");
								cwd = cwd.substr(0, index + 1);
								connectionSendStr(i, `250 OK\r\n`);
							} else {
								logger.debug(`command not implemented`);
								connectionSendStr(i, "502 Not implemented\r\n");
							}
						}						
					}
				}
			}
			
		}
		
		return listenForConnections(r);
	});
}

function getPort(p1x, p2x) {
	return (p1x * 256) + p2x;
}

function getRandomIntInclusive(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function connectionSendStr(sc, str) {
	var bufStr = Util.ascii(str);
	Net.sys_net_bnet_sendto(sc, bufStr, str.length, 0, 0, 0);
}

function messageReadStr(bufAddr, len) {
	var _len = len;
	if ((_len % 2) !== 0) {
		_len += 1;
	}
	var buf = zero.memoryReader.read(bufAddr, _len);
	var bufstr = Util.getascii(buf, 0, _len);
	return bufstr;
}

//////////////////////////

function pad(val, targetLength) {
    var output = val + '';
    while (output.length < targetLength) {
        output = '0' + output;
    }
    return output;
}

function handleMLSD(i, command, param) {
	connectionSendStr(i, "150 OK\r\n");
	
	var result = FileSystem.opendir(cwd);
	var errno = result.errno;
	var fd = result.fd;
	logger.debug(`opendir: 0x${errno.toString(16)}`);
	
	var data = "";
	
	if (errno === 0) {
		var name = null;
		do {
			result = FileSystem.readdir(fd);
			errno = result.errno;
			var type = result.type;
			name = result.name;
			if (name.length === 0) {
				break;
			}
			
			var path = cwd + name;
			if (path === "/app_home" || path === "/host_root") {
				continue;
			}
			
			result = FileSystem.fstat(path);
			errno = result.errno;
			var st = result.sb;
			
			var st_mode = Util.getint32(st, 0x0);
			var st_mtime = Util.getint32(st, 0x10);
			var st_size = Util.getint32(st, 0x28);
			
			var date = new Date(st_mtime * 1000);
			var unixMode = st_mode & 0o777;
			
			var e = "type=";
			if (name === ".") {
				e += "c";
			} else if (name === "..") {
				e += "p";
			}
			if ((st_mode & 0o40000) !== 0) {
				e += "dir";
			} else {
				e += "file";
			}
			
			e += ";siz";
			if ((st_mode & 0o40000) !== 0) {
				e += "d";
			} else {
				e += "e";
			}
			e += "=" + st_size;
			
			e += ";modify=" + pad(date.getFullYear(), 4) + pad(date.getMonth() + 1, 2)
				+ pad(date.getDay(), 2) + pad(date.getHours(), 2) + pad(date.getMinutes(), 2)
				+ pad(date.getSeconds(), 2);
				
			e += ";UNIX.mode=" + pad(unixMode.toString(8), 4);
			
			e += ";UNIX.uid=root;UNIX.gid=root; ";
			
			e += name + "\r\n";
			
			data += e;
		} while (name.length > 0);
		
		result = FileSystem.closedir(fd);
		errno = result.errno;
		
		connectionSendStr(s_data, data);
	} else {
		connectionSendStr(i, "550 ERR\r\n");
	}
	
	connectionSendStr(i, "226 OK\r\n");
	sclose(s_data);
	
}
