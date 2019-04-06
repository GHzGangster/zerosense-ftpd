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


var logger = null;

var DEFAULT_PORT = 9001;
var DEFAULT_IP = "192,168,2,137";


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
			.catch((error) => logger.error(`Error while starting. ${error}`));
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

var s = -1, s_pasv = -1, s_data = -1;

function folderTest() {
	logger.info("Starting test...");

	Promise.resolve()
		.then(() => {
			if (s !== -1) {
				logger.debug(`need to close first`);
				return;
			}
			
			var port = DEFAULT_PORT;
			logger.info(`Starting server on port ${port}`);
			logger.info(`Don't forget to run Stop before leaving!`);
			s = slisten(port, 2);
			if ((s & 0xffffffff) < 0) {
				return;
			}
			
			var fds = fd_zero();
			fds = fd_set(s, fds);
			
			var timeout = Util.bin("\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x03\x0D\x40"); // 200 ms
			
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
		//logger.debug(`select: 0x${ret.toString(16)}`);
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
						
						connectionSendStr(sc, "220 zerosense-ftpd\r\n");
					} else {
						var bufAddr = 0x8d004000;
						var bufLength = 0x1000;
						result = Net.sys_net_bnet_recvfrom(i, bufAddr, bufLength, 0, 0, 0);
						ret = result.ret;
						logger.debug(`recv: 0x${ret.toString(16)} i: 0x${i.toString(16)}`);
						
						if ((ret & 0xffffffff) <= 0) {							
							sclose(i);
							r.fds = fd_clr(i, r.fds);
						} else {
							logger.debug(`got message`);
							
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
								logger.debug(`got syst`);
								connectionSendStr(i, "215 UNIX Type: L8\r\n");
							} else if (command === "FEAT") {
								connectionSendStr(i, "211-Ext:\r\n");
								connectionSendStr(i, " SIZE\r\n");
								connectionSendStr(i, " MDTM\r\n");
								connectionSendStr(i, " PORT\r\n");
								connectionSendStr(i, " CDUP\r\n");
								connectionSendStr(i, " ABOR\r\n");
								connectionSendStr(i, " PASV\r\n");
								connectionSendStr(i, " LIST\r\n");
								connectionSendStr(i, " MLSD\r\n");
								connectionSendStr(i, " MLST type*;size*;modify*;UNIX.mode*;UNIX.uid*;UNIX.gid*;\r\n");
								connectionSendStr(i, "211 End\r\n");
							} else if (command === "PWD") {
								var cwd = "/";
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
									var serverIp = DEFAULT_IP;
									connectionSendStr(i, `227 Entering Passive Mode (${serverIp},${p1x},${p2x})\r\n`);
									
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
								connectionSendStr(i, "150 OK\r\n");
								connectionSendStr(s_data, "type=cdir;sizd=0;modify=19691231235959;UNIX.mode=0555;UNIX.uid=root;UNIX.gid=root; .\r\n");
								connectionSendStr(s_data, "type=dir;sizd=0;modify=20190318175228;UNIX.mode=0700;UNIX.uid=root;UNIX.gid=root; app_home\r\n");
								connectionSendStr(s_data, "type=dir;sizd=91610566656;modify=20190403160033;UNIX.mode=0755;UNIX.uid=root;UNIX.gid=root; dev_hdd0\r\n");
								connectionSendStr(i, "226 Closing data connection.\r\n");
								sclose(s_data);
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
