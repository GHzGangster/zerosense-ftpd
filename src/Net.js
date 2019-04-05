var zero = require('zerosense');

var ChainBuilder = require('zerosense/ChainBuilder');
var Util = require('zerosense/Util');


function sys_net_bnet_socket(family, type, protocol) {
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataInt32("ret")
		.syscall(0x2C9, family, type, protocol)
		.storeR3("ret")
		.create();
	
	chain.prepare(zero.zsArray).execute();
	
	var ret = chain.getDataInt32("ret");
	
	return { ret };
}

function sys_net_bnet_bind(s, straddr, addrlen) {
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataStr("addr", straddr)
		.addDataInt32("ret")
		.syscall(0x2BD, s, "addr", addrlen)
		.storeR3("ret")
		.create();
	
	chain.prepare(zero.zsArray).execute();
	
	var ret = chain.getDataInt32("ret");
	
	return { ret };
}

function sys_net_bnet_listen(s, backlog) {
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataInt32("ret")
		.syscall(0x2C2, s, backlog)
		.storeR3("ret")
		.create();
	
	chain.prepare(zero.zsArray).execute();
	
	var ret = chain.getDataInt32("ret");
	
	return { ret };
}

function sys_net_bnet_shutdown(s, how) {
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataInt32("ret")
		.syscall(0x2C8, s, how)
		.storeR3("ret")
		.create();
	
	chain.prepare(zero.zsArray).execute();
	
	var ret = chain.getDataInt32("ret");
	
	return { ret };
}

function sys_net_bnet_close(s) {
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataInt32("ret")
		.syscall(0x2CA, s)
		.storeR3("ret")
		.create();
	
	chain.prepare(zero.zsArray).execute();
	
	var ret = chain.getDataInt32("ret");
	
	return { ret };
}

function sys_net_bnet_accept(s) {
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataInt32("ret")
		.syscall(0x2BC, s, 0x0, 0x0) // .syscall(0x2BC, s, "addr", "paddrlen")
		.storeR3("ret")
		.create();
	
	chain.prepare(zero.zsArray).execute();
	
	var ret = chain.getDataInt32("ret");
	var addr = null; // chain.getDataInt32("addr");
	var paddrlen = null; // chain.getDataInt32("paddrlen");
	
	return { ret, addr, paddrlen };
}

function sys_net_bnet_sendto(s, buf, len, flags, addr, addrlen) {
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
			.addDataInt32("ret")
			.addDataStr("buf", buf)
			.syscall(0x2C6, s, "buf", len, flags, 0, 0)
			.storeR3("ret")
			.create();
	
	chain.prepare(zero.zsArray).execute();
	
	var ret = chain.getDataInt32("ret");
	
	return { ret };
}

function sys_net_bnet_select(nfds, readfds, writefds, exceptfds, timeout) {
	var cb = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataInt32("ret");
	
	var _readfds = 0x0;
	if (readfds) {
		_readfds = "readfds";
		cb.addDataStr(_readfds, readfds);
	}
	
	var _timeout = 0x0;
	if (timeout) {
		_timeout = "timeout";
		cb.addDataStr(_timeout, timeout);
	}
	
	var chain = cb.syscall(0x2CC, nfds, _readfds, writefds, exceptfds, _timeout)
		.storeR3("ret")
		.create();
	
	chain.prepare(zero.zsArray).execute();
	
	var ret = chain.getDataInt32("ret");
	
	var d_readfds = null;
	if (readfds) {
		d_readfds = chain.getDataBuffer(_readfds, 0x80);
	}

	return { ret, readfds: d_readfds };
}

function sys_net_bnet_recvfrom(s, buf, len, flags, addr, addrlen) {
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
			.addDataInt32("ret")
			.syscall(0x2C3, s, buf, len, flags, 0, 0)
			.storeR3("ret")
			.create();
	
	chain.prepare(zero.zsArray).execute();
	
	var ret = chain.getDataInt32("ret");
	
	return { ret };
}

module.exports = {
	sys_net_bnet_socket,
	sys_net_bnet_bind,
	sys_net_bnet_listen,
	sys_net_bnet_shutdown,
	sys_net_bnet_close,
	sys_net_bnet_accept,
	sys_net_bnet_sendto,
	sys_net_bnet_select,
	sys_net_bnet_recvfrom,
};
