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

var bufferSize = 0x200000;
var bufferAddr = 0x0;

var ip = null;

var s_server = -1;
var sessions = {};

function getServerIP() {
	var result = HelperTest.call_netctl_main_9A528B81();
	var ip = Util.getascii(result.ip, 0, 0x10);
	return ip;
}

function folderTest() {
	logger.info("Starting test...");

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
			s_server = slisten(port, 2);
			if ((s_server & 0xffffffff) < 0) {
				return;
			}			
			
			var fds = fd_zero();
			fds = fd_set(s_server, fds);
			
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
			sclose(s_server);
			s_server = -1;
			
			var result = HelperTest.sys_memory_free(bufferAddr);
			var errno = result.errno;
			logger.debug(`sys_memory_free: 0x${errno.toString(16)}`);
		})
		.then(() => logger.info("Test 2 done."))
		.catch((error) => {
			logger.error(`Error while running test 2. ${error}`);
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
 */
function listenForConnections(r) {
	return new Promise((resolve) => {
		setTimeout(() => resolve(r), 0);
	}).then((r) => {
		if (s_server <= 0) {
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
					if (i === s_server) {
						result = Net.sys_net_bnet_accept(s_server);
						ret = result.ret;
						logger.debug(`accept: 0x${ret.toString(16)}`);
						if ((ret & 0xffffffff) < 0) {
							logger.debug(`accept error: 0x${ret.toString(16)}`);
							return r;
						}
						
						let s = sessionOpen(r, ret);
						onSessionOpened(s);
						
						continue;
					}
					
					var s = sessions[i];
					if (s) {
						result = Net.sys_net_bnet_recvfrom(s.s_client, bufferAddr, bufferSize, 0, 0, 0);
						ret = result.ret;
						logger.debug(`recv: 0x${ret.toString(16)}`);
						
						if ((ret & 0xffffffff) <= 0) {
							sessionClose(r, s);
						} else {
							var bufstr = messageReadStr(bufferAddr, ret);
							bufstr = bufstr.substr(0, bufstr.indexOf("\r\n"));
							
							var command = null, param = null;
							var index = bufstr.indexOf(" ");
							if (index !== -1) {
								command = bufstr.substr(0, index);
								param = bufstr.substr(index + 1);
							} else {
								command = bufstr;
							}
							
							sessionHandleCommand(s, command, param);
						}
						continue;
					}
					
					// TODO: Get session by data socket, and handle the recv
				}
			}
			
		}
		
		return listenForConnections(r);
	});
}

function sessionOpen(r, s_client) {
	var s = {};
	s.s_client = s_client;
	s.s_data = -1;
	s.s_pasv = -1;
	s.cwd = "/";
	
	sessions[s.s_client] = s;
	
	r.fds = fd_set(s.s_client, r.fds);
	
	return s;
}

function sessionClose(r, s) {
	if (s.s_data !== -1) {
		sclose(s.s_data);
	}
	
	if (s.s_pasv !== -1) {
		sclose(s.s_pasv);
	}
	
	if (s.s_client !== -1) {
		sclose(s.s_client);
	}
	
	r.fds = fd_clr(s.s_client, r.fds);
	
	delete sessions[s.s_client];
}

function onSessionOpened(s) {
	sessionSendClientStr(s, "220 zerosense-ftpd\r\n");
}

function sessionHandleCommand(s, command, param) {
	var result = null, ret = null;
	
	if (param !== null) {
		logger.debug(`${command} ${param}`);
	} else {
		logger.debug(`${command}`);
	}
	
	if (command === "AUTH") {
		sessionSendClientStr(s, "502 Not implemented\r\n");
	} else if (command === "USER" || command === "PASS") {
		sessionSendClientStr(s, "230 Already in\r\n");
	} else if (command === "SYST") {
		sessionSendClientStr(s, "215 UNIX Type: L8\r\n");
	} else if (command === "FEAT") {
		sessionSendClientStr(s, "211-Ext:\r\n"
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
		sessionSendClientStr(s, `257 "${s.cwd}"\r\n`);
	} else if (command === "TYPE") {
		sessionSendClientStr(s, "200 TYPE OK\r\n");
	} else if (command === "PASV") {
		var pasv_port = getRandomIntInclusive(32768, 65528);
		var p1x = ((pasv_port & 0xff00) >> 8) | 0x80;
		var p2x = pasv_port & 0xff;
		let port = getPort(p1x, p2x);
		
		var pasv_s = slisten(port, 1);
		if ((pasv_s & 0xffffffff) < 0) {
			logger.debug(`pasv listen: 0x${ret.toString(16)}`);
			return;
		}
		s.s_pasv = pasv_s;
		
		var pasv_ip = ip.replace(/\./g, ',');
		sessionSendClientStr(s, `227 Entering Passive Mode (${pasv_ip},${p1x},${p2x}).\r\n`);
	} else if (command === "MLSD") {
		handleMLSD(s, command, param);
	} else if (command === "CWD") {
		if (param.charAt(0) === "/") {
			s.cwd = normalize(param + "/");
		} else {
			s.cwd = normalize(s.cwd + param + "/");
		}
		logger.debug(`cwd is now ${s.cwd}`);
		sessionSendClientStr(s, `250 OK\r\n`);
	} else if (command === "CDUP") {
		s.cwd = normalize(param + "../");
		sessionSendClientStr(s, `250 OK\r\n`);
//	} else if (command === "STOR") {
//		handleSTOR(s, command, param);
	} else {
		logger.debug(`command not implemented`);
		sessionSendClientStr(s, "502 Not implemented\r\n");
	}
}

function getPort(p1x, p2x) {
	return (p1x * 256) + p2x;
}

function getRandomIntInclusive(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sessionSendClientStr(s, str) {
	var bufStr = Util.ascii(str);
	Net.sys_net_bnet_sendto(s.s_client, bufStr, str.length, 0, 0, 0);
}

function sessionSendDataStr(s, str) {
	var bufStr = Util.ascii(str);
	Net.sys_net_bnet_sendto(s.s_data, bufStr, str.length, 0, 0, 0);
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
    var output = null;
    if (typeof val === "number") {
		output = new String(val);
    } else {
		output = val;
    }
    while (output.length < targetLength) {
        output = '0' + output;
    }
    return output;
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
	s.s_data = ret;
	
	result = FileSystem.opendir(s.cwd);
	var errno = result.errno;
	var fd = result.fd;
	
	var data = "";
	
	if (errno === 0) {
		sessionSendClientStr(s, "150 OK\r\n");
		
		let name = null;
		do {
			result = FileSystem.readdir(fd);
			errno = result.errno;
			name = result.name;
			if (name.length === 0) {
				break;
			}
			
			var path = s.cwd + name;
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
			
			var e = "type=" + (name === "." ? "c" : name === ".." ? "p" : "")
					+ (isDir ? "dir" : "file")
				+ ";siz" + (isDir ? "d" : "e") + "=" + st_size
				+ ";modify=" +  pad(date.getFullYear(), 4) + pad(date.getMonth() + 1, 2)
					+ pad(date.getDate(), 2) + pad(date.getHours(), 2) + pad(date.getMinutes(), 2)
					+ pad(date.getSeconds(), 2)
				+ ";UNIX.mode=" + pad(unixMode.toString(8), 4)
				+ ";UNIX.uid=root;UNIX.gid=root; "
				+ name + "\r\n";
			
			data += e;
		} while (name.length > 0);
		
		result = FileSystem.closedir(fd);
		errno = result.errno;
		
		sessionSendDataStr(s, data);
		
		sessionSendClientStr(s, "226 OK\r\n");
	} else {
		sessionSendClientStr(s, "550 ERR\r\n");
	}
	
	sclose(s.s_data);
	s.s_data = -1;
}

function handleSTOR(s, command, param) {	
	sessionSendClientStr(s, "150 OK\r\n");
	
	var path = s.cwd + param;
	
	var result = FileSystem.open(path, 0o102, 0o777);
	var errno = result.errno;
	var fd = result.fd;
	logger.debug(`Errno: 0x${errno.toString(16)}`);
	
	// start loop
	
	
	
	// end loop
	
	sessionSendClientStr(s, "226 OK\r\n");
}
