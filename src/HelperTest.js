var zero = require('zerosense');

var ChainBuilder = require('zerosense/ChainBuilder');
var Util = require('zerosense/Util');


function malloc(size) {	
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataInt32("ptr")
		.callsub(zero.offsets.gadgetZ2, 0, size, 0, 0, 0, 0, zero.offsets.tocZ1, 0, 0, 0x70)
		.storeR3("ptr")
		.create();
	
	chain.prepare(zero.zsArray).execute();
	
	var ptr = chain.getDataInt32("ptr");
	
	return { ptr: ptr };
}

function free(ptr) {	
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.callsub(zero.offsets.gadgetZ3, 0, ptr, 0, 0, 0, 0, zero.offsets.tocZ1, 0, 0, 0x70)
		.create();
	
	chain.prepare(zero.zsArray).execute();
}

function memcpy(dst, src, size) {	
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.callsub2(0x9F94C, 0x0, dst, src, size)
		.create();
	
	chain.prepare(zero.zsArray).execute();
}

function chmod(strpath, mode, xdata) {
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataStr("path", Util.ascii(strpath))
		.addDataInt32("errno")
		.syscall(0x342, "path", mode)
		.storeR3("errno")
		.create();
	

    chain.prepare(zero.zsArray);
	chain.execute();
	
	var errno = chain.getDataInt32("errno");
	
	return { errno: errno };
}

function createReadPtr(fd, bufptr, size) {
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataInt32("errno")
		.addDataInt64("read")
		.syscall(0x322, fd, bufptr, size, "read")
		.storeR3("errno")
		.create();
		
	return chain;
}

function executeReadPtr(chain) {
    chain.execute();
	
	var errno = chain.getDataInt32("errno");
	var read = chain.getDataInt64("read");
	
	return { errno: errno, read: read.low };
}

function createWritePtr(fd, bufptr, size) {
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataInt32("errno")
		.addDataInt64("written")
		.syscall(0x323, fd, bufptr, size, "written")
		.storeR3("errno")
		.create();
	
	return chain;
}

function executeWritePtr(chain) {
	chain.execute();
	
	var errno = chain.getDataInt32("errno");
	var written = chain.getDataInt64("written");
	
	return { errno: errno, written: written.low };
}

function sys_memory_allocate(size, flags_low) {
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataInt32("errno")
		.addDataInt32("alloc_addr")
		.syscall(0x15C, size, flags_low, "alloc_addr")
		.storeR3("errno")
		.create();
	
	chain.prepare(zero.zsArray).execute();
	
	var errno = chain.getDataInt32("errno");
	var alloc_addr = chain.getDataInt32("alloc_addr");
	
	return { errno, alloc_addr };
}

function sys_memory_free(alloc_addr) {
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataInt32("errno")
		.syscall(0x15D, alloc_addr)
		.storeR3("errno")
		.create();
	
	chain.prepare(zero.zsArray).execute();
	
	var errno = chain.getDataInt32("errno");
	
	return { errno };
}

function sys_memory_allocate_from_container(size, container, flags_low) {
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataInt32("errno")
		.addDataInt32("alloc_addr")
		.syscall(0x15E, size, container, flags_low, "alloc_addr")
		.storeR3("errno")
		.create();
	
	chain.prepare(zero.zsArray).execute();
	
	var errno = chain.getDataInt32("errno");
	var alloc_addr = chain.getDataInt32("alloc_addr");
	
	return { errno, alloc_addr };
}

function vsh_E7C34044(id) {	
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataInt32("ret")
		.callsub2(0x60A098, 0x0, id)
		.storeR3("ret")
		.create();
	
	chain.prepare(zero.zsArray).execute();
	
	var ret = chain.getDataInt32("ret");
	
	return { ret };
}

function sys_net_errno_loc() {	
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataInt32("ptr")
		.callsub(0x1A45C, 0, 0, 0, 0, 0, 0, zero.offsets.tocZ1, 0, 0, 0x70)
		.storeR3("ptr")
		.create();
	
	chain.prepare(zero.zsArray).execute();
	
	var ptr = chain.getDataInt32("ptr");
	
	return { ptr: ptr };
}

function printf(str) {	
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataStr("str", Util.ascii(str))
		.callsub(0x6036C0, "str", 0, 0, 0, 0, 0, 0, 0, 0, 0x130)
		.create();
	
	chain.prepare(zero.zsArray).execute();
}

function printf2(str) {	
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataStr("str", str)
		.callsub(0x6036C0, "str", 0, 0, 0, 0, 0, 0, 0, 0, 0x130)
		.create();
	
	chain.prepare(zero.zsArray).execute();
}

function call_netctl_main_9A528B81() {	
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataBuffer("ip", 0x10)
		.callsub(0x24DBC4, 0x10, "ip", 0, 0, 0, 0, zero.offsets.tocZ1, 0, 0, 0x170)
		.create();
	
	chain.prepare(zero.zsArray).execute();
	
	var ip = chain.getDataBuffer("ip", 0x10);
	
	return { ip };
}

function sys_net_bnet_setsockopt(s, level, optname, optval, optlen) {
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataInt32("errno")
		.addDataStr("optval", optval)
		.syscall(0x2C7, s, level, optname, "optval", optlen)
		.storeR3("errno")
		.create();
	
	chain.prepare(zero.zsArray).execute();
	
	var errno = chain.getDataInt32("errno");
	
	return { errno };
}

function sys_net_bnet_getsockopt(s, level, optname, optval, optlen) {
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataInt32("errno")
		.addDataBuffer("optval", optlen)
		.addDataStr("optlen", Util.int32(optlen))
		.syscall(0x2C1, s, level, optname, "optval", "optlen")
		.storeR3("errno")
		.create();
	
	chain.prepare(zero.zsArray).execute();
	
	var errno = chain.getDataInt32("errno");
	var doptlen = chain.getDataInt32("optlen");
	var doptval = chain.getDataBuffer("optval", doptlen);
	
	return { errno, optval: doptval, optlen: doptlen };
}

function createRecvFrom(s, buf, len, flags, addr, addrlen) {
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataInt32("ret")
		.syscall(0x2C3, s, buf, len, flags, 0, 0)
		.storeR3("ret")
		.create();
	
	return chain;
}

function executeRecvFrom(chain) {
	chain.execute();
	
	var ret = chain.getDataInt32("ret");
	
	return { ret };
}

function sys_fs_unlink(path) {
	var cb = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataInt32("errno");
	
	var _path = path;
	if (typeof path === "string") {
		_path = "_path";
		cb.addDataStr(_path, Util.ascii(path));
	}
	
	var chain = cb.syscall(0x32E, _path)
		.storeR3("errno")
		.create();
	
	chain.prepare(zero.zsArray).execute();
	
	var errno = chain.getDataInt32("errno");
	
	return { errno };
}

function sys_net_get_sockinfo(s, info, n) {	
	var chain = new ChainBuilder(zero.offsets, zero.addrGtemp)
		.addDataInt32("ret")
		.addDataBuffer("info", 0x24 * n)
		.callsub2(0x21038, zero.offsets.toc, s, "info", n)
		.storeR3("ret")
		.create();
	
	chain.prepare(zero.zsArray).execute();
	
	var ret = chain.getDataInt32("ret");
	var dinfo = chain.getDataBuffer("info", 0x24 * n);
	
	return { ret, info: dinfo };
}


module.exports = {
	malloc,
	free,
	memcpy,
	chmod,
	createReadPtr,
	executeReadPtr,
	createWritePtr,
	executeWritePtr,
	sys_memory_allocate,
	sys_memory_free,
	sys_memory_allocate_from_container,
	vsh_E7C34044,
	sys_net_errno_loc,
	printf,
	printf2,
	call_netctl_main_9A528B81,
	sys_net_bnet_setsockopt,
	sys_net_bnet_getsockopt,
	createRecvFrom,
	executeRecvFrom,
	sys_fs_unlink,
	sys_net_get_sockinfo,
};
