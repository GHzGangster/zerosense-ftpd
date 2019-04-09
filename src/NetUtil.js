const zero = require('zerosense');
var Util = require('zerosense/Util');

var Net = require('./Net.js');


function slisten(port, backlog) {
	var result = Net.sys_net_bnet_socket(2, 1, 0);
	var s = result.ret;
	zero.logger.debug(`socket: 0x${s.toString(16)}`);
	
	var sa = Util.bin("\x00\x02") + Util.int16(port) + Util.bin("\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00");
	result = Net.sys_net_bnet_bind(s, sa, 0x10);
	var ret = result.ret;
	zero.logger.debug(`bind: 0x${ret.toString(16)}`);
	if ((ret & 0xffffffff) < 0) {
		return ret;
	}
	
	result = Net.sys_net_bnet_listen(s, backlog);
	ret = result.ret;
	zero.logger.debug(`listen: 0x${ret.toString(16)}`);
	if ((ret & 0xffffffff) < 0) {
		return ret;
	}
	
	return s;
}

function sclose(fd) {
	var result = Net.sys_net_bnet_shutdown(fd, 2);
	var ret = result.ret;
	zero.logger.debug(`shutdown: 0x${ret.toString(16)}`);
	if ((ret & 0xffffffff) < 0) {
		return ret;
	}
	
	result = Net.sys_net_bnet_close(fd);
	ret = result.ret;
	zero.logger.debug(`close: 0x${ret.toString(16)}`);
	if ((ret & 0xffffffff) < 0) {
		return ret;
	}
	
	return 0;
}

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


module.exports = {
	slisten,
	sclose,
	fd_zero,
	fd_set,
	fd_clr,
	fd_isset,
}